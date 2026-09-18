# axios-eventsource

[![NPM Package][npm]][npm-url]
[![NPM Downloads][npm-downloads]][npmtrends-url]
[![Tests][tests-badge]][tests-url]
[![Coverage][coverage-badge]][coverage-url]

Server-Sent Events (SSE) for Axios — one HTTP client for your whole app.

Native `EventSource` only supports GET and can’t send custom headers (e.g. Auth tokens). Workarounds — like fetching a one-time token with Axios and passing it in the URL — are brittle. This library gives you real SSE over your existing Axios setup: same interceptors, same auth, same base URL and headers, with an API that matches the native `EventSource` where it matters.

See [packages/axios-eventsource/README.md](packages/axios-eventsource/README.md) for full documentation and API reference.

## Development

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the issue, branch, commit, and PR workflow. Releases are promoted from `dev` to `main`; see [release setup](docs/releasing.md).

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

`pnpm dev` runs the library in watch mode, Express and Fastify SSE demos, and a demo site. See the repo for layout (`packages/axios-eventsource`, `examples/`, etc.).

## Acknowledgments

- **[eventsource-parser](https://github.com/rexxars/eventsource-parser)** — robust SSE stream parsing.
- **[Zod](https://zod.dev)** — Schema validation for typed event data.

## License

[MIT](LICENSE) © Ben Houston

## Author

[Ben Houston](https://ben3d.ca), Sponsored by [Land of Assets](https://landofassets.com)

[npm]: https://img.shields.io/npm/v/axios-eventsource
[npm-url]: https://www.npmjs.com/package/axios-eventsource
[npm-downloads]: https://img.shields.io/npm/dw/axios-eventsource
[npmtrends-url]: https://www.npmtrends.com/axios-eventsource
[tests-badge]: https://github.com/bhouston/axios-eventsource/actions/workflows/ci.yml/badge.svg
[tests-url]: https://github.com/bhouston/axios-eventsource/actions/workflows/ci.yml
[coverage-badge]: https://codecov.io/gh/bhouston/axios-eventsource/branch/dev/graph/badge.svg
[coverage-url]: https://codecov.io/gh/bhouston/axios-eventsource
