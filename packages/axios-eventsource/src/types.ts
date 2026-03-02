import type { AxiosInstance, AxiosRequestConfig, RawAxiosRequestHeaders } from "axios";

export type AxiosEventSourceReadyState = 0 | 1 | 2;

export type AuthStrategy =
  | { type: "none" }
  | { type: "basic"; username: string; password: string }
  | { type: "bearer"; token: string | (() => string | Promise<string>) };

export type ReconnectOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
  /** Maximum number of reconnect attempts after a failure. Omit for unlimited. */
  maxRetries?: number;
};

/**
 * Mirrors the minimal Event interface for open events.
 */
export type SseEvent = {
  readonly type: string;
};

/**
 * Mirrors the browser MessageEvent for SSE message events.
 * `source` is always null and `ports` is always empty for SSE streams.
 */
export type SseMessageEvent = {
  readonly type: string;
  readonly data: string;
  readonly origin: string;
  readonly lastEventId: string;
  readonly source: null;
  readonly ports: readonly [];
};

/**
 * Shape of the error event (type + error). The dispatched event is an instance of {@link SseErrorEvent} (class).
 */
export type SseErrorEventPayload = {
  readonly type: "error";
  readonly error: unknown;
};

/**
 * Options passed to addEventListener / removeEventListener.
 * Mirrors the browser AddEventListenerOptions (subset relevant to SSE).
 */
export type AddEventListenerOptions = {
  once?: boolean;
};

/**
 * A listener that is either a callback function or an object with a `handleEvent` method,
 * matching the browser EventListenerOrEventListenerObject pattern.
 */
export type SseEventListener<T> = ((event: T) => void) | { handleEvent(event: T): void };

export type AxiosEventSourceOptions = Omit<
  AxiosRequestConfig,
  "adapter" | "auth" | "decompress" | "method" | "responseType" | "signal"
> & {
  auth?: AuthStrategy;
  headers?: RawAxiosRequestHeaders;
  method?: "GET" | "POST";
  reconnect?: ReconnectOptions;
  signal?: AbortSignal;
  withCredentials?: boolean;
  /** Text decoding for the stream. Default `"utf-8"`. Passed to `TextDecoder`. */
  encoding?: string;
  /** Reject non-200 responses or responses whose Content-Type is not `text/event-stream`. Default `true`. */
  rejectNonEventStream?: boolean;
  onopen?: (event: SseEvent) => void;
  onerror?: (event: SseErrorEventPayload) => void;
};

export type AxiosEventSourceLike = EventTarget & {
  readonly readyState: AxiosEventSourceReadyState;
  readonly url: string;
  readonly withCredentials: boolean;
  onopen: ((event: SseEvent) => void) | null;
  onmessage: ((event: SseMessageEvent) => void) | null;
  onerror: ((event: SseErrorEventPayload) => void) | null;
  close(): void;
};

export type AxiosEventSourceFactory = {
  (axios: AxiosInstance, url: string, options?: AxiosEventSourceOptions): AxiosEventSourceLike;
  (url: string, options?: AxiosEventSourceOptions): AxiosEventSourceLike;
};
