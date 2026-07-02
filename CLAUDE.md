# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A desktop app (Electron + React + TypeScript, built with `electron-vite`) that
inspects gRPC traffic like a browser's Network tab. It does **not** capture gRPC
directly — it reads a text log written by another desktop app, parses the network
lines, correlates request/response pairs into calls, and **live-tails** the file.

## Commands

```bash
npm run dev         # run the app in dev (Vite HMR for the renderer)
npm run build       # bundle main + preload + renderer into out/
npm start           # preview the production build
npm run typecheck   # tsc --noEmit for BOTH projects (node + web)
npm run lint        # eslint (flat config in eslint.config.mjs)
npm run lint:fix    # eslint --fix
```

Always run `npm run typecheck && npm run lint` before considering a change done;
`npm run build` is the end-to-end check.

There is **no test framework**. The parsing/correlation logic lives in `src/shared`
(framework-free, no Electron/DOM), so smoke-test it by compiling those files and
running them under Node against the sample:

```bash
npx tsc src/shared/*.ts --outDir /tmp/sc --module commonjs --target es2022 \
  --moduleResolution node --esModuleInterop --skipLibCheck
NODE_PATH="$PWD/node_modules" node -e '
  const { CallCorrelator } = require("/tmp/sc/callCorrelator.js");
  const fs = require("fs");
  const c = new CallCorrelator();
  c.ingestLines(fs.readFileSync("sample-logs/sample.txt","utf8").split(/\r?\n/));
  console.log(c.snapshot());'
```

`NODE_PATH` is needed because `logParser.ts` imports `json5`.

## Architecture

Data flows one direction, main → renderer; the renderer never parses logs.

```
file ──> LogSource (main) ──> CallCorrelator (shared) ──> GrpcCall[]
                │                                            │
        fs.watch tail                          webContents.send('logs:snapshot')
                                                             │
                              preload window.api.onLogSnapshot ──> App.setCalls()
```

- **`src/shared/`** — the model + all parsing, framework-free so both processes
  import one definition and it stays unit-testable.
  - `models.ts` — `GrpcCall`, `GrpcMessage`, `LogSnapshot`, status/type enums.
  - `logParser.ts` — the line regex, `deriveName()` (name → service/method/type +
    correlation key), `REQUEST_RESPONSE_OVERRIDES` (explicit request↔response name
    mapping), and payload parsing (JSON5 → Python-repr normalizer → raw-string
    fallback).
  - `callCorrelator.ts` — stateful FIFO-per-key grouping of lines into `GrpcCall`s;
    derives duration/size/offsets and success/failure `outcome`.
- **`src/main/`**
  - `index.ts` — window/lifecycle, prod-only CSP (via response headers), and the
    `ipcMain.handle` handlers (`app:getVersion`, `logs:openFile`, `logs:loadSample`,
    `logs:clear`).
  - `logSource.ts` — open dialog, read the file, `fs.watch` tail (byte-offset reads,
    partial-line buffering, truncation handling), debounced snapshot push. All
    load/read ops go through `runExclusive` (serialization) so overlapping calls
    can't double-ingest. `clear()` resets the correlator but keeps the file offset,
    so only lines appended after Clear appear.
- **`src/preload/index.ts`** — the ONLY renderer↔main surface. Exposes a typed
  `api` object (its `Api` type is imported by `src/renderer/src/env.d.ts`).
- **`src/renderer/src/`** — React. `App.tsx` subscribes to snapshots and owns
  filter/selection state. `components/`: `Toolbar`, `RequestList` (incl. the Result
  column), `DetailPanel` (tabs), `JsonTree` (interactive per-node collapsible JSON),
  `badges`. `types.ts` just re-exports `../../shared/models`.

## Conventions & gotchas

- **Two TS projects.** `tsconfig.node.json` (main + preload + shared) and
  `tsconfig.web.json` (renderer + shared). Both are `composite`, so any new
  top-level source dir must be added to the relevant `include` lists — and because
  `src/shared` is imported by both, it's listed in both.
- **Adding a main↔renderer capability:** add a method to `api` in
  `src/preload/index.ts` and a matching `ipcMain.handle(...)` in `src/main/index.ts`.
  Never expose `ipcRenderer` directly (contextIsolation/sandbox are on).
- **Main-process changes need a full restart.** Vite HMR only reloads the renderer;
  edits to `src/main` or `src/shared` require restarting `npm run dev`. Many
  "it didn't take effect" issues are a stale main process.
- **React StrictMode double-invokes effects in dev**, so `App`'s startup effect
  loads the sample twice — `LogSource.runExclusive` is what keeps that from
  duplicating rows. Keep load/read paths serialized.
- **Parsing rules live in `src/shared/logParser.ts`.** New request/response name
  pairings go in `REQUEST_RESPONSE_OVERRIDES`. New payload dialects (e.g. more
  Python types) go in the `normalizePythonLiterals` retry path, which only rewrites
  tokens OUTSIDE quoted strings — preserve that invariant so string values are never
  corrupted.
- **One log entry per line** is assumed; timestamps are parsed leniently and fall
  back to a monotonic clock. Truncated payloads are unrecoverable and render as raw
  strings by design.
- **CSP** is applied only in the packaged app (relaxed in dev for HMR).
- **Sample log** is `sample-logs/sample.txt`; it's loaded on startup and is the
  fixture used for verification.
