import axios, { type AxiosInstance, type AxiosResponse, type RawAxiosRequestHeaders } from "axios";
import { parseSseStream } from "./parseSseStream.js";
import { getNextDelay, getReconnectConfig, sleepWithAbort } from "./reconnect.js";
import type {
  AxiosEventSourceFactory,
  AxiosEventSourceLike,
  AxiosEventSourceOptions,
  AxiosEventSourceReadyState,
  SchemaAddEventListenerOptions,
  SseErrorEventPayload,
  SseEvent,
  SseEventListener,
  SseMessageEvent,
} from "./types.js";

/** ReadyState constant: connection not yet open. */
export const CONNECTING = 0 as const;
/** ReadyState constant: connection is open. */
export const OPEN = 1 as const;
/** ReadyState constant: connection is closed. */
export const CLOSED = 2 as const;

const READY_STATE_CONNECTING = CONNECTING;
const READY_STATE_OPEN = OPEN;
const READY_STATE_CLOSED = CLOSED;

/**
 * Error event with an .error property for the underlying failure.
 * Dispatched when the connection fails or encounters an error.
 */
export class SseErrorEvent extends Event {
  readonly error: unknown;
  constructor(error: unknown) {
    super("error");
    this.error = error;
  }
}

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

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Try to get the final URL from the response (e.g. after redirects). */
function getResponseUrl(response: AxiosResponse): string | undefined {
  const r = response as unknown as {
    url?: string;
    request?: { url?: string; responseURL?: string };
  };
  if (typeof r.url === "string") return r.url;
  if (typeof r.request?.responseURL === "string") return r.request.responseURL;
  if (typeof r.request?.url === "string") return r.request.url;
  return undefined;
}

function isEventStreamResponse(response: AxiosResponse): boolean {
  const ct = response.headers?.["content-type"];
  if (typeof ct !== "string") return false;
  const base = ct.split(";")[0]?.trim().toLowerCase() ?? "";
  return base === "text/event-stream";
}

function isSchemaAddEventListenerOptions(
  options: boolean | AddEventListenerOptions | undefined,
): options is SchemaAddEventListenerOptions<unknown> & AddEventListenerOptions {
  return typeof options === "object" && options !== null && "schema" in options;
}

/**
 * SSE client that extends EventTarget and matches the EventSource API surface.
 * Uses Axios for the request so interceptors, auth, and config are reused.
 */
export class AxiosEventSource extends EventTarget {
  readonly withCredentials: boolean;
  private _readyState: AxiosEventSourceReadyState = READY_STATE_CONNECTING;
  private _url: string;
  private _initialUrl: string;
  private _origin: string;
  private _abortController = new AbortController();
  private _onopen: ((event: SseEvent) => void) | null = null;
  private _onmessage: ((event: SseMessageEvent) => void) | null = null;
  private _onerror: ((event: SseErrorEventPayload) => void) | null = null;
  private _typedListenerWrappers = new Map<string, WeakMap<object, EventListener>>();

  constructor(
    private readonly _client: AxiosInstance,
    url: string,
    private readonly _options: AxiosEventSourceOptions = {},
  ) {
    super();
    this._initialUrl = url;
    this._url = url;
    this._origin = getOrigin(url);
    this.withCredentials = _options.withCredentials ?? false;
    this._onopen = _options.onopen ?? null;
    this._onerror = _options.onerror ?? null;
  }

  get readyState(): AxiosEventSourceReadyState {
    return this._readyState;
  }

  get url(): string {
    return this._url;
  }

  get onopen(): ((event: SseEvent) => void) | null {
    return this._onopen;
  }

  set onopen(value: ((event: SseEvent) => void) | null) {
    this._onopen = value;
  }

  get onmessage(): ((event: SseMessageEvent) => void) | null {
    return this._onmessage;
  }

  set onmessage(value: ((event: SseMessageEvent) => void) | null) {
    this._onmessage = value;
  }

  get onerror(): ((event: SseErrorEventPayload) => void) | null {
    return this._onerror;
  }

  set onerror(value: ((event: SseErrorEventPayload) => void) | null) {
    this._onerror = value;
  }

  close(): void {
    if (!this._abortController.signal.aborted) {
      this._abortController.abort();
    }
    this._readyState = READY_STATE_CLOSED;
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (listener === null) {
      return;
    }

    if (isSchemaAddEventListenerOptions(options)) {
      const listenerKey = listener as unknown as object;
      const wrappersByType =
        this._typedListenerWrappers.get(type) ?? new WeakMap<object, EventListener>();
      this._typedListenerWrappers.set(type, wrappersByType);

      const existingWrapper = wrappersByType.get(listenerKey);
      if (existingWrapper !== undefined) {
        super.addEventListener(type, existingWrapper, options);
        return;
      }

      const wrappedListener: EventListener = (event: Event) => {
        const rawEvent = event as unknown as SseMessageEvent;
        const typedListener = listener as unknown as SseEventListener<SseMessageEvent<unknown>>;
        try {
          const rawData = JSON.parse(rawEvent.data);
          const parsedData = options.schema.parse(rawData);
          const parsedEvent = {
            ...(rawEvent as SseMessageEvent),
            data: parsedData,
          } as SseMessageEvent<unknown>;
          if (typeof typedListener === "function") {
            typedListener(parsedEvent);
            return;
          }
          typedListener.handleEvent(parsedEvent);
        } catch (error) {
          options.onParseError?.(error, rawEvent);
          if (!options.onParseError) {
            throw error;
          }
        }
      };

      wrappersByType.set(listenerKey, wrappedListener);
      super.addEventListener(type, wrappedListener, options);
      return;
    }

    super.addEventListener(type, listener, options);
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (listener === null) {
      return;
    }

    const wrappersByType = this._typedListenerWrappers.get(type);
    const wrapper = wrappersByType?.get(listener as unknown as object);
    if (wrapper !== undefined) {
      super.removeEventListener(type, wrapper, options);
      wrappersByType?.delete(listener as unknown as object);
      return;
    }

    super.removeEventListener(type, listener, options);
  }

  /** Called by the factory to start the connection loop. */
  _start(): void {
    const options = this._options;
    const reconnect = getReconnectConfig(options.reconnect);
    const rejectNonEventStream = options.rejectNonEventStream !== false;
    const encoding = options.encoding ?? "utf-8";

    const {
      auth: _ignoredAuth,
      method: _ignoredMethod,
      reconnect: _ignoredReconnect,
      onopen: _ignoredOnopen,
      onerror: _ignoredOnerror,
      encoding: _ignoredEncoding,
      rejectNonEventStream: _ignoredReject,
      ...requestOptions
    } = options;

    const method = options.method ?? "GET";
    const url = this._initialUrl;

    // If external signal is already aborted, close immediately.
    if (options.signal?.aborted) {
      this.close();
      return;
    }
    options.signal?.addEventListener("abort", () => this.close(), { once: true });

    const connect = async (): Promise<void> => {
      let lastEventId = "";
      let baseReconnectDelay = reconnect.initialDelayMs;
      let reconnectDelay = baseReconnectDelay;
      let retryCount = 0;

      while (!this._abortController.signal.aborted) {
        try {
          const authHeaders = await resolveAuthHeaders(options);
          const response = await this._client.request({
            method,
            url,
            ...requestOptions,
            headers: {
              Accept: "text/event-stream",
              "Cache-Control": "no-cache",
              ...(options.headers ?? {}),
              ...authHeaders,
              ...(lastEventId !== "" ? { "Last-Event-ID": lastEventId } : {}),
            },
            responseType: "stream",
            adapter: "fetch",
            decompress: false,
            signal: this._abortController.signal,
          });

          if (response.status !== 200) {
            throw new Error(`Unexpected status code: ${response.status}`);
          }

          if (rejectNonEventStream && !isEventStreamResponse(response)) {
            throw new Error(
              `Expected Content-Type text/event-stream, got ${response.headers?.["content-type"] ?? "unknown"}`,
            );
          }

          const responseUrl = getResponseUrl(response);
          if (responseUrl !== undefined) {
            this._url = responseUrl;
            this._origin = getOrigin(responseUrl);
          }

          this._readyState = READY_STATE_OPEN;
          reconnectDelay = baseReconnectDelay;
          retryCount = 0;

          const openEvent = new Event("open");
          this.dispatchEvent(openEvent);
          this._onopen?.(openEvent as SseEvent);

          for await (const parsed of parseSseStream(
            response.data as ReadableStream<Uint8Array>,
            {
              onRetry: (ms) => {
                baseReconnectDelay = ms;
                reconnectDelay = ms;
              },
            },
            encoding,
          )) {
            if (this._abortController.signal.aborted) {
              return;
            }

            lastEventId = parsed.lastEventId;

            const messageEvent = new MessageEvent(parsed.type, {
              data: parsed.data,
              origin: this._origin,
              lastEventId: parsed.lastEventId,
            });

            if (parsed.type === "message") {
              this._onmessage?.(messageEvent as unknown as SseMessageEvent);
            }
            this.dispatchEvent(messageEvent);
          }
        } catch (error) {
          if (this._abortController.signal.aborted) {
            return;
          }

          retryCount += 1;
          const errorEvent = new SseErrorEvent(error);
          this.dispatchEvent(errorEvent);
          this._onerror?.(errorEvent as SseErrorEventPayload);
        }

        if (this._abortController.signal.aborted) {
          return;
        }

        const maxRetries = reconnect.maxRetries;
        if (maxRetries !== undefined && retryCount >= maxRetries) {
          this.close();
          return;
        }

        this._readyState = READY_STATE_CONNECTING;
        await sleepWithAbort(reconnectDelay, this._abortController.signal);
        reconnectDelay = getNextDelay(reconnectDelay, reconnect.maxDelayMs);
      }
    };

    void connect();
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

  const instance = new AxiosEventSource(client, url, options);
  instance._start();
  return instance;
};

export type {
  AddEventListenerOptions,
  AuthStrategy,
  AxiosEventSourceLike,
  AxiosEventSourceOptions,
  ReconnectOptions,
  SchemaAddEventListenerOptions,
  SseErrorEventPayload,
  SseEvent,
  SseEventListener,
  SseMessageEvent,
} from "./types.js";
