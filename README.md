# axios-eventsource

[![NPM Package][npm]][npm-url]
[![NPM Downloads][npm-downloads]][npmtrends-url]
[![Tests][tests-badge]][tests-url]
[![Coverage][coverage-badge]][coverage-url]

`axios-eventsource` is a production-grade Server-Sent Events client that matches the native `EventSource` API as closely as possible while running on Axios.

This project intentionally challenges the idea that "Axios should not be used for SSE."
If your app already relies on Axios for authentication, interceptors, base URLs, headers, retries, and environment-specific config, you should not need a separate networking stack just to consume event streams.

## What's New (vs. a naive SSE client)

### `Last-Event-ID` Recovery

Most SSE clients stream events and forget them. This library persists the last received event id across reconnects and sends the `Last-Event-ID` header so the server can resume without gaps — exactly as the SSE spec requires.

### Server-Driven Reconnect Delay

The server can send a `retry:` frame to override the client's backoff base. This library respects it: `retry: 5000` means the client waits 5 seconds before reconnecting, regardless of the configured `initialDelayMs`.

### `MessageEvent`-Like Payloads

Every event has the same shape as the browser's native `MessageEvent`:

```ts
event.type        // event name ("message" by default)
event.data        // payload string
event.origin      // e.g. "https://api.example.com"
event.lastEventId // always a string; "" when no id was received
event.source      // null (per SSE spec)
event.ports       // [] (per SSE spec)
```

### `EventTarget`-Like Listener API

- `addEventListener("open", handler)` — fires when the connection opens
- `addEventListener("error", handler)` — fires on transport failure, with `event.error` carrying the actual error
- `addEventListener("ping", handler, { once: true })` — fires once then auto-removes
- Object listeners with `handleEvent` are supported

### Full Interface Parity

```ts
stream.readyState;      // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
stream.url;             // the URL as passed
stream.withCredentials; // from options (default false)
```

## Features

- **Axios-native SSE client**: Reuse existing Axios instances, interceptors, defaults, and environment config.
- **`Last-Event-ID` recovery**: Automatic id persistence and header replay on reconnect.
- **Server-driven reconnect delay**: Respects `retry:` frames from the server.
- **`MessageEvent`-like payloads**: `origin`, `lastEventId`, `source`, `ports` on every event.
- **`EventTarget`-like listener API**: `once` option and `handleEvent` object listeners.
- **`open` and `error` via `addEventListener`**: Connection lifecycle events through the standard listener path.
- **Production-ready auth**: Interceptors, `none`, `basic`, and `bearer` (including async token providers).
- **Exponential backoff**: Configurable `initialDelayMs` / `maxDelayMs` with server override support.
- **Typed API surface**: Full TypeScript types for all options, event payloads, and client interface.

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
```

## EventSource Compatibility Summary

| Feature | Native `EventSource` | `axios-eventsource` |
| :--- | :--- | :--- |
| `Last-Event-ID` on reconnect | Yes | Yes |
| Respects `retry:` from server | Yes | Yes |
| `MessageEvent` payload shape | Yes | Yes (`SseMessageEvent`) |
| `open`/`error` via `addEventListener` | Yes | Yes |
| `once` and `handleEvent` listener options | Yes | Yes |
| `url`, `withCredentials`, `readyState` | Yes | Yes |
| Axios interceptors / auth | No | Yes |
| POST method support | No | Yes |
| Node.js compatible | No | Yes |

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

[npm]: https://img.shields.io/npm/v/axios-eventsource
[npm-url]: https://www.npmjs.com/package/axios-eventsource
[npm-downloads]: https://img.shields.io/npm/dw/axios-eventsource
[npmtrends-url]: https://www.npmtrends.com/axios-eventsource
[tests-badge]: https://github.com/bhouston/axios-eventsource/workflows/Tests/badge.svg
[tests-url]: https://github.com/bhouston/axios-eventsource/actions/workflows/test.yml
[coverage-badge]: https://codecov.io/gh/bhouston/axios-eventsource/branch/main/graph/badge.svg
[coverage-url]: https://codecov.io/gh/bhouston/axios-eventsource
