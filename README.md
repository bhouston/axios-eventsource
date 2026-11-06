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

Native `EventSource` only supports GET and cannot send custom headers such as auth tokens. Workarounds, like fetching a one-time token with Axios and passing it in the URL, are brittle. `axios-eventsource` gives you real SSE over your existing Axios setup: same interceptors, same auth, same base URL and headers, with an API that matches the native `EventSource` where it matters.

It sends the request through Axios using the `fetch` adapter, parses the event stream, and dispatches `MessageEvent` objects to `onmessage` and to `addEventListener` listeners. If the connection drops it reconnects with exponential backoff and sends the last event id it saw.

See [packages/axios-eventsource/README.md](packages/axios-eventsource/README.md) for the full API reference.

## Quick Start

```sh
pnpm add axios-eventsource axios zod
```

```ts
import axios from 'axios';
import { axiosEventSource } from 'axios-eventsource';

const client = axios.create({ baseURL: 'https://api.example.com' });
const stream = axiosEventSource(client, '/events');

stream.onmessage = (event) => console.log(event.data);
```

## Development

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the issue, branch, commit, and PR workflow. See [RELEASING.md](RELEASING.md) for the release process and [SECURITY.md](SECURITY.md) to report vulnerabilities.

```bash
pnpm install
pnpm dev
pnpm tsc # type check
pnpm build
pnpm lint # oxlint
pnpm lint:fix
pnpm format # oxfmt
pnpm test --coverage # vitest and coverage gate
pnpm size # bundle budget
```

`pnpm tsc`, TypeScript build steps, and the library's watch command use the pinned official TypeScript 7.1 beta compiler.

`pnpm dev` runs the library in watch mode, Express and Fastify SSE demos, and a demo site. See the repo for layout (`packages/axios-eventsource`, `examples/`, etc.).

## Acknowledgments

- **[eventsource-parser](https://github.com/rexxars/eventsource-parser)**: robust SSE stream parsing.
- **[Zod](https://zod.dev)**: schema validation for typed event data.

## Contribution

See [Contributing Guide](CONTRIBUTING.md).

## License

MIT

## Author

[Ben Houston](https://ben3d.ca), Sponsored by [Land of Assets](https://landofassets.com).
