<p align="center">
  <a href="https://npmjs.com/package/axios-eventsource"><img src="https://img.shields.io/npm/v/axios-eventsource.svg" alt="npm package"></a>
  <a href="https://www.npmtrends.com/axios-eventsource"><img src="https://img.shields.io/npm/dw/axios-eventsource.svg" alt="npm downloads"></a>
  <a href="https://codecov.io/gh/bhouston/axios-eventsource"><img src="https://codecov.io/gh/bhouston/axios-eventsource/branch/main/graph/badge.svg" alt="coverage"></a>
  <a href="https://discord.gg/fwupDN493R"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat&logo=discord" alt="discord chat"></a>
</p>
<br/>

# axios-eventsource

> Server-Sent Events for Axios, with typed events and automatic reconnection.

- 🔌 Reuses Your Axios Instance
- 🔁 Automatic Reconnect With Backoff
- 🧭 Resumes With Last-Event-ID
- 🧩 EventSource-Style API
- 🔐 Built-In Auth Strategies
- ✅ Zod-Validated Event Data

Native `EventSource` only supports GET and cannot send custom headers such as auth tokens. `axios-eventsource` gives you real SSE over your existing Axios setup: same interceptors, same auth, same base URL and headers, with an API that matches the native `EventSource` where it matters.

It sends the request through Axios using the `fetch` adapter, parses the event stream, and dispatches `MessageEvent` objects to `onmessage` and to `addEventListener` listeners. If the connection drops it reconnects with exponential backoff and sends the last event id it saw. See the [repository](https://github.com/bhouston/axios-eventsource) for runnable Express and Fastify demos.

## Install

```sh
pnpm add axios-eventsource axios zod
```

`axios` (>=1) and `zod` (>=4) are peer dependencies. Node.js 22 or newer is required.

## Quick Start

```ts
import axios from 'axios';
import { axiosEventSource } from 'axios-eventsource';

const client = axios.create({
  baseURL: 'https://api.example.com',
});

const stream = axiosEventSource(client, '/events', {
  reconnect: { initialDelayMs: 1_000, maxDelayMs: 30_000 },
  onopen: (event) => {
    console.log('SSE connected, type:', event.type);
  },
  onerror: (event) => {
    console.error('SSE error:', event.error);
  },
});

stream.onmessage = (event) => {
  console.log('message:', event.data, 'from:', event.origin);
};

stream.addEventListener('tick', (event) => {
  const { data, lastEventId } = event as MessageEvent<string>;
  const payload = JSON.parse(data) as { count: number };
  console.log('tick:', payload.count, 'lastEventId:', lastEventId);
});

// Later
// stream.close();
```

## Typed Event Data

Pass a Zod schema to `addEventListener` and the event `data` is parsed as JSON, validated, and typed for you:

```ts
import { z } from 'zod';
import type { SseMessageEvent } from 'axios-eventsource';

const Tick = z.object({ count: z.number().int() });
type TickListener = EventListener & ((event: SseMessageEvent<z.infer<typeof Tick>>) => void);

const onTick = ((event: SseMessageEvent<z.infer<typeof Tick>>) => {
  console.log(event.data.count); // number
}) as TickListener;

stream.addEventListener('tick', onTick, {
  schema: Tick,
  onParseError: (error, rawEvent) => console.warn('bad tick', rawEvent.data, error),
});
```

`addEventListener` is typed against the DOM `EventListener`, so the listener is cast as shown. Without `onParseError`, a parse or validation failure is thrown from the listener. Remove a schema listener with `removeEventListener('tick', onTick)`.

## EventSource Parity

### `Last-Event-ID` Recovery

When the server sends events with `id:` fields, the client keeps the latest id and sends it as the `Last-Event-ID` header on every reconnect, so the server can resume the stream.

```text
Server sends: id: 42 -> Client stores "42"
Connection drops
Client reconnects with: Last-Event-ID: 42
Server resumes from id 43
```

If an event has no `id:` field it inherits the most recently seen id. `lastEventId` is `""` until an id is received.

### Server-Driven Reconnect Delay (`retry:`)

A `retry:` frame from the server replaces the client's base delay (`initialDelayMs`):

```text
retry: 5000
```

Exponential backoff still applies from that base on consecutive failures, and the delay resets to the base after each successful connection.

### `MessageEvent` Payloads

Events delivered to `onmessage` and to listeners are `MessageEvent` instances with this shape:

```ts
type SseMessageEvent = {
  readonly type: string; // event name, "message" when the stream has no event field
  readonly data: string; // event payload
  readonly origin: string; // origin of the stream URL
  readonly lastEventId: string; // "" if no id was ever received
  readonly source: null;
  readonly ports: readonly [];
};
```

Comments (lines starting with `:`) are ignored and multiline `data:` is joined with newlines. An empty `event:` field is passed through as `""`.

### `open` and `error` Events

```ts
stream.addEventListener('open', (event) => {
  // event.type === 'open'
});

stream.addEventListener('error', (event) => {
  // event is an SseErrorEvent, event.error is the underlying Axios or network error
  console.error(event.error);
});
```

The error event carries the real error, which is more useful than the bare `Event` that native `EventSource` provides.

### `EventTarget` Listener Semantics

The returned object extends `EventTarget`, so `instanceof EventTarget` and the standard listener APIs work.

```ts
// once: true, the listener fires once then removes itself
stream.addEventListener('tick', handler, { once: true });

// Object listener with a handleEvent method
stream.addEventListener('message', {
  handleEvent(event) {
    console.log((event as MessageEvent<string>).data);
  },
});
```

### Interface Properties

```ts
import { CONNECTING, OPEN, CLOSED } from 'axios-eventsource';

stream.readyState; // CONNECTING (0), OPEN (1), or CLOSED (2)
stream.url; // the URL, updated to the final response URL when the adapter provides it
stream.withCredentials; // boolean, from options.withCredentials (default false)
```

## Authentication

Authenticate through your existing Axios instance or through the built-in `auth` option.

### Reuse Your Axios Interceptors

```ts
import axios from 'axios';
import { axiosEventSource } from 'axios-eventsource';

const client = axios.create();

client.interceptors.request.use(async (config) => {
  const token = await getFreshAccessToken();
  config.headers = config.headers ?? {};
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const stream = axiosEventSource(client, 'https://api.example.com/sse');
```

### Use Built-In Auth Strategies

```ts
import { axiosEventSource } from 'axios-eventsource';

// No Authorization header
axiosEventSource('https://api.example.com/sse', {
  auth: { type: 'none' },
});

// Basic auth
axiosEventSource('https://api.example.com/sse', {
  auth: { type: 'basic', username: 'demo', password: 'secret' },
});

// Bearer auth (string or async token provider)
axiosEventSource('https://api.example.com/sse', {
  auth: { type: 'bearer', token: async () => getFreshAccessToken() },
});
```

## API

### `axiosEventSource(...)`

Overloads:

- `axiosEventSource(axiosInstance, url, options?)`
- `axiosEventSource(url, options?)`, which creates a default Axios instance

Returns an `AxiosEventSourceLike` object (extends `EventTarget`):

- `readyState`: `CONNECTING` (0), `OPEN` (1), or `CLOSED` (2); use the exported constants.
- `url`: the stream URL, updated after redirects when the adapter provides it.
- `withCredentials`: boolean, default `false`.
- `onopen`: receives an event with `type: "open"`.
- `onmessage`: receives the `MessageEvent` for events without a custom type.
- `onerror`: receives an `SseErrorEvent` with an `error` property.
- `addEventListener(type, listener, options?)`: supports `"open"`, `"error"`, `"message"`, and any named event type. Options are `{ once?: boolean }`, or `{ schema, onParseError? }` for validated data.
- `removeEventListener(type, listener)`
- `close()`

`options` accepts standard Axios request config (except `adapter`, `decompress` and `responseType`, which the library sets itself) plus:

| Option                 | Description                                                                                                              |
| :--------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| `method`               | `'GET'` (default) or `'POST'`. Use Axios `data` for a POST body.                                                         |
| `headers`              | Extra request headers.                                                                                                   |
| `auth`                 | Built-in auth strategy: `none`, `basic`, or `bearer`.                                                                    |
| `reconnect`            | `{ initialDelayMs?, maxDelayMs?, maxRetries? }`. Defaults to 1 s initial and 30 s maximum delay, unlimited retries.      |
| `encoding`             | Text decoding for the stream, default `"utf-8"`, passed to `TextDecoder`.                                                |
| `rejectNonEventStream` | Reject responses whose `Content-Type` is not `text/event-stream`. Default `true`. Non-200 responses are always rejected. |
| `signal`               | External `AbortSignal`; aborting it closes the stream.                                                                   |
| `withCredentials`      | Boolean.                                                                                                                 |
| `onopen`               | `(event) => void`                                                                                                        |
| `onerror`              | `(event) => void`                                                                                                        |

`maxRetries` counts consecutive failures. When it is reached the stream is closed and `readyState` becomes `CLOSED`.

## Differences From Native `EventSource`

| Area                           | Native `EventSource`   | `axios-eventsource`                      | Reason                                  |
| :----------------------------- | :--------------------- | :--------------------------------------- | :-------------------------------------- |
| Constructor                    | `new EventSource(url)` | `axiosEventSource(client, url, options)` | Enables Axios instance injection        |
| `error` event                  | Bare `Event`           | `SseErrorEvent` with an `error` field    | Carries the actual error for debugging  |
| Request method                 | GET only               | GET or POST                              | Some APIs stream from POST endpoints    |
| Network layer                  | Browser native         | Axios with the `fetch` adapter           | Interceptors, auth, and Node.js support |
| `CONNECTING`, `OPEN`, `CLOSED` | Statics on the class   | Exported constants                       | Same values; import when needed         |

## Contribution

See [Contributing Guide](https://github.com/bhouston/axios-eventsource/blob/main/CONTRIBUTING.md).

## License

MIT

## Author

[Ben Houston](https://ben3d.ca), Sponsored by [Land of Assets](https://landofassets.com).
