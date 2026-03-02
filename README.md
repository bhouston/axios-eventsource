# axios-eventsource

[![NPM Package][npm]][npm-url]
[![NPM Downloads][npm-downloads]][npmtrends-url]
[![Tests][tests-badge]][tests-url]
[![Coverage][coverage-badge]][coverage-url]

`axios-eventsource` is a production-grade Server-Sent Events client that matches the native `EventSource` API as closely as possible while running on Axios.

This project intentionally challenges the idea that "Axios should not be used for SSE."
If your app already relies on Axios for authentication, interceptors, base URLs, headers, retries, and environment-specific config, you should not need a separate networking stack just to consume event streams.

## Features

- **Axios-native SSE client**: Reuse existing Axios instances, interceptors, defaults, and environment config.
- **`Last-Event-ID` recovery**: Automatic id persistence and header replay on reconnect.
- **Server-driven reconnect delay**: Respects `retry:` frames from the server.
- **`MessageEvent`-like payloads**: `origin`, `lastEventId`, `source`, `ports` on every event.
- **`EventTarget`-like listener API**: `once` option and `handleEvent` object listeners.
- **`open` and `error` via `addEventListener`**: Connection lifecycle events through the standard listener path.
- **Production-ready auth**: Interceptors, `none`, `basic`, and `bearer` (including async token providers).
- **Exponential backoff**: Configurable `initialDelayMs` / `maxDelayMs` with server override support.
- **Max reconnect limit**: Optional `reconnect.maxRetries` to stop after a set number of failures.
- **Content-Type check**: Optional `rejectNonEventStream` (default `true`) rejects non–`text/event-stream` responses.
- **Encoding**: Optional `encoding` (default `"utf-8"`) passed to `TextDecoder` for the stream.
- **URL and origin after redirects**: When the adapter exposes the final response URL, `url` and event `origin` use it.
- **SSE parsing**: Comments (`:...`) are ignored; multiline `data:` is concatenated with newlines per the spec. Event type defaults to `"message"` only when the `event` field is absent (empty `event:` is passed through as `""`).
- **Typed API surface**: Full TypeScript types for all options, event payloads, and client interface.
- **EventTarget**: The returned instance extends `EventTarget`, so `instanceof EventTarget` and `dispatchEvent` work as expected.

## Install

```sh
pnpm add axios-eventsource axios
```

## Quick Start

```ts
import axios from "axios";
import { axiosEventSource } from "axios-eventsource";

const client = axios.create({
  baseURL: "https://api.example.com",
});

const stream = axiosEventSource(client, "/events", {
  reconnect: { initialDelayMs: 1_000, maxDelayMs: 30_000 },
  onopen: (event) => {
    console.log("SSE connected, type:", event.type);
  },
  onerror: (event) => {
    console.error("SSE error:", event.error);
  },
});

stream.onmessage = (event) => {
  console.log("message:", event.data, "lastEventId:", event.lastEventId);
};

stream.addEventListener("tick", (event) => {
  const payload = JSON.parse(event.data) as { count: number };
  console.log("tick:", payload.count);
});

// Later
// stream.close();
```

## Why Axios + SSE Works Well

Native `EventSource` is great for simple anonymous GET streams.
But many production systems need authenticated, centralized HTTP behavior:

- rotating bearer tokens
- tenant-aware routing
- shared headers
- unified instrumentation/logging
- one request client used across your app

This library uses Axios with streaming (`fetch` adapter) under the hood and parses SSE frames for you, so you can keep one HTTP strategy and still build reactive event-driven UIs.

## Authentication

### 1) Reuse your Axios interceptors

```ts
const client = axios.create();
client.interceptors.request.use(async (config) => {
  config.headers.Authorization = `Bearer ${await getFreshAccessToken()}`;
  return config;
});
const stream = axiosEventSource(client, "https://api.example.com/sse");
```

### 2) Built-in auth strategies

```ts
axiosEventSource("https://api.example.com/sse", {
  auth: { type: "bearer", token: async () => getFreshAccessToken() },
});

// Or: auth: { type: "none" } | { type: "basic", username, password }
```

## EventSource parity (details)

### `Last-Event-ID` recovery

When the server sends events with `id:` fields, the client persists the latest received id. On every reconnect, the `Last-Event-ID` header is sent so the server can resume without resending already-delivered events.

```text
Server sends: id: 42 → Client stores "42"
Connection drops
Client reconnects with: Last-Event-ID: 42
Server resumes from id 43
```

The `lastEventId` field accumulates per the SSE spec: if an event has no `id:` field, it inherits the most recently seen id.

### Server-driven reconnect delay (`retry:`)

The server can override the reconnect delay by sending a `retry:` frame (e.g. `retry: 5000`). That becomes the new base for exponential backoff until the next successful connection.

### `MessageEvent`-like payloads

Every event has the same shape as the browser `MessageEvent`:

```ts
type SseMessageEvent = {
  readonly type: string;        // event name, default "message"
  readonly data: string;        // event payload
  readonly origin: string;      // e.g. "https://api.example.com"
  readonly lastEventId: string; // "" if no id was received
  readonly source: null;       // always null for SSE (per spec)
  readonly ports: readonly [];  // always empty for SSE (per spec)
};
```

### `open` and `error` via `addEventListener`

```ts
stream.addEventListener("open", (event) => {
  // event.type === "open"
});

stream.addEventListener("error", (event) => {
  // event is SseErrorEvent; event.error has the underlying Axios/network error
  console.error(event.error);
});
```

### `EventTarget`-like listener semantics

- `once: true` — listener fires once then is removed.
- Object listeners with `handleEvent(event)` are supported.
- The same listener reference added twice is only registered once (per spec).

## API

### `axiosEventSource(...)`

Key exports: `axiosEventSource`, `CONNECTING`, `OPEN`, `CLOSED`, the `SseErrorEvent` class, and types `AxiosEventSourceLike`, `AxiosEventSourceOptions`, `ReconnectOptions`, `SseEvent`, `SseMessageEvent`, `SseErrorEventPayload`, `AuthStrategy`, `AddEventListenerOptions`, `SseEventListener`.

Overloads:

- `axiosEventSource(axiosInstance, url, options?)`
- `axiosEventSource(url, options?)`

Returns an object that extends `EventTarget` (`AxiosEventSourceLike`):

- `readyState` — `CONNECTING` (0), `OPEN` (1), or `CLOSED` (2); use exported constants.
- `url` — the URL (after redirects when the adapter provides it).
- `withCredentials` — boolean (default `false`).
- `onopen` — receives `SseEvent` (e.g. `Event` with `type: "open"`). Callback: `(event: SseEvent) => void`.
- `onmessage` — receives `MessageEvent` (or `SseMessageEvent`-shaped). Callback: `(event: SseMessageEvent) => void`.
- `onerror` — callback parameter type `SseErrorEventPayload`; at runtime the value is an `SseErrorEvent` instance (class with `.error`). Callback: `(event: SseErrorEventPayload) => void`.
- `addEventListener(type, listener, options?)` — supports `"open"`, `"error"`, `"message"`, and any named event type; options: `{ once?: boolean }`.
- `removeEventListener(type, listener)`
- `close()`

`options` supports standard Axios request config (with SSE-safe restrictions) plus:

- `auth` — built-in auth strategy (`none`, `basic`, `bearer` with optional async token).
- `reconnect` — `{ initialDelayMs?, maxDelayMs?, maxRetries? }`.
- `encoding` — text decoding (default `"utf-8"`), passed to `TextDecoder`.
- `rejectNonEventStream` — reject non–`text/event-stream` responses (default `true`).
- `signal` — external `AbortSignal`.
- `withCredentials` — boolean.
- `onopen` — `(event: SseEvent) => void`
- `onerror` — `(event: SseErrorEventPayload) => void`

### Intentional deviations from native `EventSource`

| Area | Native `EventSource` | `axios-eventsource` | Reason |
| :--- | :--- | :--- | :--- |
| Constructor | `new EventSource(url)` | `axiosEventSource(client, url, opts)` | Enables Axios instance injection |
| `onerror` event | Bare `Event` | `SseErrorEvent` class with `error` field | Carries the actual error for debugging |
| Network adapter | Browser native | Axios + Fetch adapter | Enables interceptors, auth, Node.js |
| `CONNECTING/OPEN/CLOSED` | On constructor | Exported constants | Same values; import when needed |
| Capture phase | Supported via options | Not supported | SSE listeners don't use capture |

## EventSource Compatibility Summary

| Feature | Native `EventSource` | `axios-eventsource` |
| :--- | :--- | :--- |
| `Last-Event-ID` on reconnect | Yes | Yes |
| Respects `retry:` from server | Yes | Yes |
| `MessageEvent` payload shape | Yes | Yes (`SseMessageEvent`) |
| `open`/`error` via `addEventListener` | Yes | Yes |
| `once` and `handleEvent` listener options | Yes | Yes |
| `url`, `withCredentials`, `readyState` | Yes | Yes |
| `CONNECTING` / `OPEN` / `CLOSED` constants | Yes | Yes (exported) |
| Extends `EventTarget` | Yes | Yes |
| Axios interceptors / auth | No | Yes |
| POST method support | No | Yes |
| Node.js compatible | No | Yes (Node 18+) |

### Requirements and limitations

- **Adapter**: Uses Axios with the fetch adapter and streaming response; the response body must be a `ReadableStream<Uint8Array>`.
- **Node**: In Node.js, use Node 18+ so `EventTarget` and `MessageEvent` are available.
- **Encoding**: The stream is decoded as UTF-8 by default; use the `encoding` option to override.
- **URL / origin**: `url` and event `origin` are taken from the request URL you pass. When the adapter exposes the final response URL (e.g. after redirects), the library uses it for `url` and `origin`.
- **Reconnect**: Reconnecting continues until you call `close()` or abort `signal`, unless `reconnect.maxRetries` is set.
- **Content-Type**: By default, responses must have `Content-Type: text/event-stream`; set `rejectNonEventStream: false` to allow other types.

## Local Development

```sh
pnpm install
pnpm dev
pnpm test
```

`pnpm dev` starts:

- package watch mode (`packages/axios-eventsource`)
- Express SSE demo at `http://localhost:4001` — `/sse`, `/sse/recovery`, `/sse/retry`
- Fastify SSE demo at `http://localhost:4002` — `/api/events/stream`, `/api/events/recovery`, `/api/events/retry`
- Demo website at `http://localhost:3000` — scenario selector for standard, recovery, and retry demos

## Monorepo Layout

- `packages/axios-eventsource`: publishable library
- `packages/axios-eventsource-tests`: integration and edge-case tests
- `examples/express-server`: SSE producer demo (Express)
- `examples/fastify-server`: SSE producer demo (Fastify)
- `examples/website`: consumer demo (TanStack Start)

## Author

[Ben Houston](https://benhouston3d.com), Sponsored by [Land of Assets](https://landofassets.com)

[npm]: https://img.shields.io/npm/v/axios-eventsource
[npm-url]: https://www.npmjs.com/package/axios-eventsource
[npm-downloads]: https://img.shields.io/npm/dw/axios-eventsource
[npmtrends-url]: https://www.npmtrends.com/axios-eventsource
[tests-badge]: https://github.com/bhouston/axios-eventsource/workflows/Tests/badge.svg
[tests-url]: https://github.com/bhouston/axios-eventsource/actions/workflows/test.yml
[coverage-badge]: https://codecov.io/gh/bhouston/axios-eventsource/branch/main/graph/badge.svg
[coverage-url]: https://codecov.io/gh/bhouston/axios-eventsource
