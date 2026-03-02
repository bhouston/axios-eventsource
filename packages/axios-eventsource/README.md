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
- **`Last-Event-ID` recovery**: Persists the last received event id across reconnects and sends it as the `Last-Event-ID` header so servers can resume streams without gaps.
- **Server-driven reconnect delay**: Respects `retry:` frames from the server, overriding the client-side backoff base.
- **`MessageEvent`-like payloads**: Each event includes `type`, `data`, `origin`, `lastEventId`, `source`, and `ports` — matching the shape of the browser `MessageEvent`.
- **`EventTarget`-like listener API**: `addEventListener` supports `{ once: true }` options and object listeners with `handleEvent`, matching the browser `EventTarget` contract.
- **`open` and `error` events via `addEventListener`**: Register listeners for connection lifecycle events using the same API as named events.
- **Interface parity**: Exposes `url`, `withCredentials`, `readyState`, `onopen`, `onmessage`, and `onerror` matching the native `EventSource` interface.
- **Production-ready auth paths**: Use interceptors for token refresh, or built-in `auth` strategies: `none`, `basic`, and `bearer` (including async token providers).
- **Resilient reconnect behavior**: Automatic reconnect with configurable exponential backoff (`initialDelayMs`, `maxDelayMs`) and optional `maxRetries`.
- **Max reconnect limit**: Set `reconnect.maxRetries` to stop after a set number of failures.
- **Content-Type check**: By default (`rejectNonEventStream: true`), responses must be `text/event-stream`; set to `false` to allow other types.
- **Encoding**: Optional `encoding` (default `"utf-8"`) passed to `TextDecoder` for the stream.
- **URL and origin after redirects**: When the adapter exposes the final response URL, `url` and event `origin` use it.
- **SSE parsing**: Comments (lines starting with `:`) are ignored; multiline `data:` is concatenated with newlines per the spec. Event type defaults to `"message"` only when the `event` field is absent; an empty `event:` is passed through as `""`.
- **EventTarget**: The returned instance extends `EventTarget`; `instanceof EventTarget` and standard listener APIs work.
- **Typed API surface**: Strong TypeScript types throughout.

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
  // event is MessageEvent-like: data, origin, lastEventId, source, ports
  console.log("message:", event.data, "from:", event.origin);
};

stream.addEventListener("tick", (event) => {
  const payload = JSON.parse(event.data) as { count: number };
  console.log("tick:", payload.count, "lastEventId:", event.lastEventId);
});

// Register an open listener using addEventListener
stream.addEventListener("open", (event) => {
  console.log("open event type:", event.type);
});

// Register an error listener with once:true
stream.addEventListener("error", (event) => {
  console.error("first error:", event.error);
}, { once: true });

// Later
// stream.close();
```

## EventSource Parity

### `Last-Event-ID` Recovery

When the server sends events with `id:` fields, the client automatically persists the latest received id. On every reconnect (after a disconnect or error), the `Last-Event-ID` header is sent so the server can resume the stream without resending already-delivered events.

```text
Server sends: id: 42 → Client stores "42"
Connection drops
Client reconnects with: Last-Event-ID: 42
Server resumes from id 43
```

The `lastEventId` field accumulates across events per the SSE spec: if an event has no `id:` field, it inherits the id from the most recently seen `id:` in the stream.

### Server-Driven Reconnect Delay (`retry:`)

The server can override the reconnect delay at any time by sending a `retry:` frame:

```text
retry: 5000
```

This sets the reconnect base to 5 seconds, replacing the client-configured `initialDelayMs`. Exponential backoff still applies from this new base on consecutive failures. The delay resets to the server-provided value after each successful connection.

### `MessageEvent`-Like Event Payloads

Every event delivered to `onmessage`, `addEventListener`, or named event listeners has this shape:

```ts
type SseMessageEvent = {
  readonly type: string;        // event name, default "message"
  readonly data: string;        // event payload
  readonly origin: string;      // origin derived from the URL (e.g. "https://api.example.com")
  readonly lastEventId: string; // always a string; "" if no id was ever received
  readonly source: null;        // always null for SSE (per spec)
  readonly ports: readonly [];  // always empty for SSE (per spec)
};
```

### `open` and `error` Events via `addEventListener`

```ts
stream.addEventListener("open", (event) => {
  // event: { type: "open" }
});

stream.addEventListener("error", (event) => {
  // event: { type: "error", error: unknown }
  console.error(event.error);
});
```

The `error` field on `SseErrorEvent` carries the underlying Axios or network error — more useful than the bare `Event` object that native `EventSource` provides.

### `EventTarget`-Like Listener Semantics

```ts
// once: true — listener fires once then auto-removes
stream.addEventListener("tick", handler, { once: true });

// Object listener with handleEvent method
stream.addEventListener("message", {
  handleEvent(event: SseMessageEvent) {
    console.log(event.data);
  },
});

// Same listener reference added twice is only registered once (per spec)
stream.addEventListener("ping", handler);
stream.addEventListener("ping", handler); // no-op
```

### Interface Properties

```ts
import { CONNECTING, OPEN, CLOSED } from "axios-eventsource";

stream.readyState;      // CONNECTING (0), OPEN (1), or CLOSED (2)
stream.url;             // URL (after redirects when the adapter provides it)
stream.withCredentials; // boolean, from options.withCredentials (default false)
```

## Authentication

You can authenticate either through your existing Axios instance/interceptors or through the built-in `auth` option.

### 1) Reuse your Axios interceptors

```ts
import axios from "axios";
import { axiosEventSource } from "axios-eventsource";

const client = axios.create();

client.interceptors.request.use(async (config) => {
  const token = await getFreshAccessToken();
  config.headers = config.headers ?? {};
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const stream = axiosEventSource(client, "https://api.example.com/sse");
```

### 2) Use built-in auth strategies

```ts
import { axiosEventSource } from "axios-eventsource";

// No Authorization header
axiosEventSource("https://api.example.com/sse", {
  auth: { type: "none" },
});

// Basic auth
axiosEventSource("https://api.example.com/sse", {
  auth: { type: "basic", username: "demo", password: "secret" },
});

// Bearer auth (string or async token provider)
axiosEventSource("https://api.example.com/sse", {
  auth: { type: "bearer", token: async () => getFreshAccessToken() },
});
```

## API

### `axiosEventSource(...)`

Overloads:

- `axiosEventSource(axiosInstance, url, options?)`
- `axiosEventSource(url, options?)`

Returns an `AxiosEventSourceLike` object (extends `EventTarget`):

- `readyState` — `CONNECTING` (0), `OPEN` (1), or `CLOSED` (2); use exported constants.
- `url` — the URL (after redirects when the adapter provides it)
- `withCredentials` — boolean (default `false`)
- `onopen` — receives `Event` with `type: "open"`
- `onmessage` — receives `MessageEvent` (or `SseMessageEvent`-shaped)
- `onerror` — receives `SseErrorEvent` (class with `error` property)
- `addEventListener(type, listener, options?)` — supports `"open"`, `"error"`, `"message"`, and any named event type; options: `{ once?: boolean }`
- `removeEventListener(type, listener)`
- `close()`

`options` supports standard Axios request config (with SSE-safe restrictions) plus:

- `auth` — built-in auth strategy
- `reconnect` — `{ initialDelayMs?, maxDelayMs?, maxRetries? }`
- `encoding` — text decoding (default `"utf-8"`), passed to `TextDecoder`
- `rejectNonEventStream` — reject non–`text/event-stream` responses (default `true`)
- `signal` — external `AbortSignal`
- `withCredentials` — boolean
- `onopen` — `(event: SseEvent) => void`
- `onerror` — `(event: SseErrorEventPayload) => void`

## Intentional Deviations from Native `EventSource`

| Area | Native `EventSource` | `axios-eventsource` | Reason |
| :--- | :--- | :--- | :--- |
| Constructor | `new EventSource(url)` | `axiosEventSource(client, url, opts)` | Enables Axios instance injection |
| `onerror` event | Bare `Event` | `SseErrorEvent` class with `error` field | Carries the actual error for debugging |
| Network adapter | Browser native | Axios + Fetch adapter | Enables interceptors, auth, and Node.js compatibility |
| `CONNECTING/OPEN/CLOSED` statics | On constructor | Exported constants | Same values; import when needed |
| Capture phase | Supported via options | Not supported | SSE listeners don't use capture |

## Why Axios + SSE Works Well

Native `EventSource` is great for simple anonymous GET streams.
But many production systems need authenticated, centralized HTTP behavior:

- rotating bearer tokens
- tenant-aware routing
- shared headers
- unified instrumentation/logging
- one request client used across your app

This library uses Axios with streaming (`fetch` adapter) under the hood and parses SSE frames for you, so you can keep one HTTP strategy and still build reactive event-driven UIs.

## Local Development

```sh
pnpm install
pnpm dev
pnpm test
```

`pnpm dev` starts:

- package watch mode (`packages/axios-eventsource`)
- Express SSE demo at `http://localhost:4001` — endpoints: `/sse`, `/sse/recovery`, `/sse/retry`
- Fastify SSE demo at `http://localhost:4002` — endpoints: `/api/events/stream`, `/api/events/recovery`, `/api/events/retry`
- Demo website at `http://localhost:3000` — includes scenario selector for standard, recovery, and retry demos

[npm]: https://img.shields.io/npm/v/axios-eventsource
[npm-url]: https://www.npmjs.com/package/axios-eventsource
[npm-downloads]: https://img.shields.io/npm/dw/axios-eventsource
[npmtrends-url]: https://www.npmtrends.com/axios-eventsource
[tests-badge]: https://github.com/bhouston/axios-eventsource/workflows/Tests/badge.svg
[tests-url]: https://github.com/bhouston/axios-eventsource/actions/workflows/test.yml
[coverage-badge]: https://codecov.io/gh/bhouston/axios-eventsource/branch/main/graph/badge.svg
[coverage-url]: https://codecov.io/gh/bhouston/axios-eventsource
