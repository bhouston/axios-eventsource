import axios, { type AxiosInstance, type RawAxiosRequestHeaders } from "axios";
import { parseSseStream } from "./parseSseStream.js";
import { getNextDelay, getReconnectConfig, sleepWithAbort } from "./reconnect.js";
import type {
  AddEventListenerOptions,
  AxiosEventSourceFactory,
  AxiosEventSourceLike,
  AxiosEventSourceOptions,
  AxiosEventSourceReadyState,
  SseErrorEvent,
  SseEvent,
  SseEventListener,
  SseMessageEvent,
} from "./types.js";

const READY_STATE_CONNECTING = 0 as const;
const READY_STATE_OPEN = 1 as const;
const READY_STATE_CLOSED = 2 as const;

type AnyListener = SseEventListener<SseEvent | SseMessageEvent | SseErrorEvent>;

type ListenerEntry = {
  listener: AnyListener;
  once: boolean;
};

function isAxiosInstance(value: unknown): value is AxiosInstance {
  const candidate = value as AxiosInstance;
  return (
    (typeof value === "function" || (typeof value === "object" && value !== null)) &&
    typeof candidate.request === "function" &&
    typeof candidate.get === "function"
  );
}

function toBase64(value: string): string {
  if (typeof btoa === "function") {
    return btoa(value);
  }
  return Buffer.from(value).toString("base64");
}

async function resolveAuthHeaders(
  options?: AxiosEventSourceOptions,
): Promise<RawAxiosRequestHeaders> {
  const auth = options?.auth;
  if (!auth || auth.type === "none") {
    return {};
  }

  if (auth.type === "basic") {
    const token = toBase64(`${auth.username}:${auth.password}`);
    return { Authorization: `Basic ${token}` };
  }

  const token = typeof auth.token === "function" ? await auth.token() : auth.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function invokeListener(
  listener: AnyListener,
  event: SseEvent | SseMessageEvent | SseErrorEvent,
): void {
  if (typeof listener === "function") {
    listener(event);
  } else {
    listener.handleEvent(event);
  }
}

function createDispatchers() {
  const listenerMap = new Map<string, ListenerEntry[]>();

  function add(type: string, listener: AnyListener, options?: AddEventListenerOptions): void {
    const arr = listenerMap.get(type) ?? [];
    if (arr.some((entry) => entry.listener === listener)) {
      return;
    }
    arr.push({ listener, once: options?.once ?? false });
    listenerMap.set(type, arr);
  }

  function remove(type: string, listener: AnyListener): void {
    const arr = listenerMap.get(type);
    if (!arr) {
      return;
    }
    const idx = arr.findIndex((entry) => entry.listener === listener);
    if (idx !== -1) {
      arr.splice(idx, 1);
    }
    if (arr.length === 0) {
      listenerMap.delete(type);
    }
  }

  function emit(type: string, event: SseEvent | SseMessageEvent | SseErrorEvent): void {
    const arr = listenerMap.get(type);
    if (!arr) {
      return;
    }
    const snapshot = [...arr];
    for (const entry of snapshot) {
      invokeListener(entry.listener, event);
      if (entry.once) {
        remove(type, entry.listener);
      }
    }
  }

  return { add, remove, emit };
}

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export const axiosEventSource: AxiosEventSourceFactory = (
  clientOrUrl: AxiosInstance | string,
  urlOrOptions?: string | AxiosEventSourceOptions,
  maybeOptions?: AxiosEventSourceOptions,
): AxiosEventSourceLike => {
  const client = isAxiosInstance(clientOrUrl) ? clientOrUrl : axios.create();
  const url = isAxiosInstance(clientOrUrl) ? (urlOrOptions as string) : clientOrUrl;
  const options = isAxiosInstance(clientOrUrl)
    ? maybeOptions
    : (urlOrOptions as AxiosEventSourceOptions | undefined);

  const abortController = new AbortController();
  const reconnect = getReconnectConfig(options?.reconnect);
  const origin = getOrigin(url);
  const events = createDispatchers();
  const {
    auth: _ignoredAuth,
    method: _ignoredMethod,
    reconnect: _ignoredReconnect,
    onopen: _ignoredOnopen,
    onerror: _ignoredOnerror,
    ...requestOptions
  } = options ?? {};

  const method = options?.method ?? "GET";
  const withCredentials = options?.withCredentials ?? false;

  let readyState: AxiosEventSourceReadyState = READY_STATE_CONNECTING;
  let onopen: ((event: SseEvent) => void) | null = options?.onopen ?? null;
  let onmessage: ((event: SseMessageEvent) => void) | null = null;
  let onerror: ((event: SseErrorEvent) => void) | null = options?.onerror ?? null;

  const close = () => {
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
    readyState = READY_STATE_CLOSED;
  };

  options?.signal?.addEventListener("abort", close, { once: true });

  const connect = async (): Promise<void> => {
    // lastEventId persists across reconnects and is sent as Last-Event-ID header.
    let lastEventId = "";
    // Server-sent retry: overrides the configured initial delay as the reconnect base.
    let baseReconnectDelay = reconnect.initialDelayMs;
    let reconnectDelay = baseReconnectDelay;

    while (!abortController.signal.aborted) {
      try {
        const authHeaders = await resolveAuthHeaders(options);
        const response = await client.request({
          method,
          url,
          ...requestOptions,
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            ...(options?.headers ?? {}),
            ...authHeaders,
            ...(lastEventId !== "" ? { "Last-Event-ID": lastEventId } : {}),
          },
          responseType: "stream",
          adapter: "fetch",
          decompress: false,
          signal: abortController.signal,
        });

        if (response.status !== 200) {
          throw new Error(`Unexpected status code: ${response.status}`);
        }

        readyState = READY_STATE_OPEN;
        reconnectDelay = baseReconnectDelay;

        const openEvent: SseEvent = { type: "open" };
        onopen?.(openEvent);
        events.emit("open", openEvent);

        for await (const parsed of parseSseStream(response.data as ReadableStream<Uint8Array>, {
          onRetry: (ms) => {
            baseReconnectDelay = ms;
            reconnectDelay = ms;
          },
        })) {
          if (abortController.signal.aborted) {
            return;
          }

          lastEventId = parsed.lastEventId;

          const messageEvent: SseMessageEvent = {
            type: parsed.type,
            data: parsed.data,
            origin,
            lastEventId: parsed.lastEventId,
            source: null,
            ports: [],
          };

          if (parsed.type === "message") {
            onmessage?.(messageEvent);
          }
          events.emit(parsed.type, messageEvent);
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        const errorEvent: SseErrorEvent = { type: "error", error };
        onerror?.(errorEvent);
        events.emit("error", errorEvent);
      }

      if (abortController.signal.aborted) {
        return;
      }
      readyState = READY_STATE_CONNECTING;
      await sleepWithAbort(reconnectDelay, abortController.signal);
      reconnectDelay = getNextDelay(reconnectDelay, reconnect.maxDelayMs);
    }
  };

  void connect();

  return {
    get readyState() {
      return readyState;
    },
    get url() {
      return url;
    },
    get withCredentials() {
      return withCredentials;
    },
    get onopen() {
      return onopen;
    },
    set onopen(value) {
      onopen = value;
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(value) {
      onmessage = value;
    },
    get onerror() {
      return onerror;
    },
    set onerror(value) {
      onerror = value;
    },
    addEventListener(type, listener, opts) {
      events.add(type, listener as AnyListener, opts);
    },
    removeEventListener(type, listener) {
      events.remove(type, listener as AnyListener);
    },
    close,
  };
};

export type {
  AddEventListenerOptions,
  AuthStrategy,
  AxiosEventSourceLike,
  AxiosEventSourceOptions,
  ReconnectOptions,
  SseErrorEvent,
  SseEvent,
  SseEventListener,
  SseMessageEvent,
} from "./types.js";
