# phx_ts

`phx_ts` is an experiment and a learning exercise. It's an attempt to port the JS libraries bundled with the Phoenix & Phoenix LiveView package to TypeScript such that you can install them via Hex, update your `package.json` and get all the resulting types with no change in functionality. Bundled and tested with [Bun](https://bun.sh).

I'll be doing the same for `phoenix_live_view` as the 2nd package in this monorepo soon. Both will be published to Hex independently of one another.

This isn't officially endorsed by the Phoenix team. I'm doing it because it's fun, and I think it'd be easier to maintain, extend, and consume the framework if the JS clients were written in TypeScript and shipped types.

## Development

To install dependencies:

```bash
bun install
```

To build:

```bash
bun run build
```

We run the tests only against the generated JavaScript - so you must build the project before running the suite. Once that's done, run the tests:

```bash
bun test
```

This project was created using `bun init` in bun v1.1.7. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
