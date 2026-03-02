# axios-eventsource

[![NPM Package][npm]][npm-url]
[![NPM Downloads][npm-downloads]][npmtrends-url]
[![Tests][tests-badge]][tests-url]
[![Coverage][coverage-badge]][coverage-url]

Server-Sent Events (SSE) for Axios — one HTTP client for your whole app.

Native `EventSource` only supports GET and can’t send custom headers (e.g. Auth tokens). Workarounds — like fetching a one-time token with Axios and passing it in the URL — are brittle. This library gives you real SSE over your existing Axios setup: same interceptors, same auth, same base URL and headers, with an API that matches the native `EventSource` where it matters.

## Why use this

- **One stack**: Use your existing Axios instance for both REST and SSE — no separate `EventSource` or fetch-based streaming.
- **Auth and headers**: Send `Authorization`, API keys, or any headers via interceptors or built-in `auth` options. No URL token hacks.
- **Familiar API**: `onopen`, `onmessage`, `onerror`, `addEventListener`, `readyState`, and `close()` work like native `EventSource`.
- **Production behavior**: Automatic reconnects with exponential backoff, `Last-Event-ID` replay, and server `retry:` support.
- **Everywhere**: Browser (with fetch adapter) and Node.js 18+.

## Install

```sh
pnpm add axios-eventsource axios zod
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

## Typed + validated event data (Zod)

When you pass a `schema` in the third `addEventListener` parameter, the library parses
`event.data` with `JSON.parse` and validates it with Zod before invoking your listener.

```ts
import { z } from "zod";

const serverEventDataSchemas = {
  "asset:created": z.object({
    asset: z.object({ id: z.number().int(), name: z.string() }),
  }),
  "asset:deleted": z.object({
    assetId: z.number().int(),
    orgName: z.string(),
    projectName: z.string(),
    assetName: z.string(),
  }),
} as const;

stream.addEventListener("asset:created", (event) => {
  // event.data is typed as { asset: { id: number; name: string } }
  console.log(event.data.asset.id);
}, {
  schema: serverEventDataSchemas["asset:created"],
  onParseError: (error, rawEvent) => {
    console.error("Invalid SSE payload for", rawEvent.type, error);
  },
});
```

Without `schema`, behavior is unchanged and `event.data` remains a raw string.

## Authentication

Use the same Axios client and interceptors you already have:

```ts
const client = axios.create();
client.interceptors.request.use(async (config) => {
  config.headers.Authorization = `Bearer ${await getFreshAccessToken()}`;
  return config;
});
const stream = axiosEventSource(client, "https://api.example.com/sse");
```

Or use built-in auth so you don’t need a pre-configured instance:

```ts
axiosEventSource("https://api.example.com/sse", {
  auth: { type: "bearer", token: async () => getFreshAccessToken() },
});

// Or: auth: { type: "none" } | { type: "basic", username, password }
```

## EventSource parity and behavior

The client follows the SSE spec and native `EventSource` semantics where possible:

- **`Last-Event-ID`**: Stored and sent on reconnect so the server can resume.
- **Server `retry:`**: Reconnect delay can be overridden by the server.
- **MessageEvent-like events**: Each event has `type`, `data`, `origin`, `lastEventId`, `source`, `ports`.
- **Lifecycle**: `open` and `error` via `addEventListener`; `once` and `handleEvent` object listeners supported.
- **EventTarget**: The returned instance extends `EventTarget`; `url`, `readyState` (CONNECTING/OPEN/CLOSED), and `close()` behave like native.

Additional options: configurable reconnect backoff (`initialDelayMs`, `maxDelayMs`), optional `reconnect.maxRetries`, `encoding` (default UTF-8), and `rejectNonEventStream` (default `true`) to reject non–`text/event-stream` responses. Full TypeScript types are exported.

## API overview

- **`axiosEventSource(axiosInstance, url, options?)`** or **`axiosEventSource(url, options?)`** — returns an `EventTarget`-like stream.
- **Properties**: `readyState`, `url`, `withCredentials`; **callbacks**: `onopen`, `onmessage`, `onerror`.
- **Methods**: `addEventListener(type, listener, options?)`, `removeEventListener(type, listener)`, `close()`.
- **Options**: Any Axios request config (method, headers, etc.) plus `auth`, `reconnect`, `encoding`, `rejectNonEventStream`, `signal`, `withCredentials`, `onopen`, `onerror`.

Constants `CONNECTING`, `OPEN`, `CLOSED` and the `SseErrorEvent` class are exported; types such as `AxiosEventSourceOptions`, `SseMessageEvent`, and `AuthStrategy` are available for TypeScript.

### Differences from native `EventSource`

| Area | Native `EventSource` | `axios-eventsource` |
| :--- | :--- | :--- |
| Constructor | `new EventSource(url)` | `axiosEventSource(client, url, opts)` |
| `onerror` | Bare `Event` | `SseErrorEvent` with `.error` for the real failure |
| Transport | Browser built-in | Axios + fetch adapter (interceptors, auth, Node.js) |
| Custom headers / POST | No | Yes |

### Requirements

- **Adapter**: Uses Axios with the fetch adapter; response body must be a `ReadableStream<Uint8Array>`.
- **Node**: Node 18+ for `EventTarget` and `MessageEvent`.
- **Reconnect**: Runs until `close()` or `signal` abort, unless `reconnect.maxRetries` is set.

## Local Development

```sh
pnpm install
pnpm dev
pnpm test
```

`pnpm dev` runs the library in watch mode, Express and Fastify SSE demos, and a demo site. See the repo for layout (`packages/axios-eventsource`, `examples/`, etc.).

## Acknowledgments

- **[eventsource-parser](https://github.com/rexxars/eventsource-parser)** — robust SSE stream parsing.
- **[Zod](https://zod.dev)** — Schema validation for typed event data.

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
