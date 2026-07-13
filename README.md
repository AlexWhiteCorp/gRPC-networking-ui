# gRPC Networking UI

Desktop application (Electron + React + TypeScript) for inspecting gRPC traffic —
a "Network tab" for gRPC. Shows executed calls with their payloads, responses,
metadata, status, and timing.

> **Status:** log-ingestion phase. The request list is built from a text log
> written by another app: network lines are parsed and correlated into calls,
> and the selected file is **live-tailed** (new appended lines stream in). A
> bundled sample (`sample-logs/sample.txt`) loads on startup; use **Open log
> file…** to tail any file. There is no direct gRPC capture yet.

## Features

- **Request list** — service/method, RPC type, status, **result** (success/failure),
  size, time, duration. Text + RPC-type + status filters, and **Clear** (wipes the
  list and keeps tailing, so only later lines appear).
- **Detail panel** — Metadata, Messages, Timing, and Status tabs. Message payloads
  render as an interactive **JSON tree** where every object/array collapses
  independently.
- **Live tail** — pick a file (or the sample); new appended lines show up within
  ~100 ms.

## Requirements

- Node.js 20+
- npm 10+

## Getting started

```bash
npm install   # install dependencies (downloads Electron)
npm run dev   # launch the app with hot-reload
```

## Scripts

| Command             | Description                                        |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Launch the app in development (Vite HMR)           |
| `npm run build`     | Type-check and build main/preload/renderer bundles |
| `npm start`         | Preview the production build                        |
| `npm run typecheck` | Type-check both the node and web projects           |
| `npm run lint`      | Run ESLint                                           |
| `npm run dist:mac`  | Build a macOS `.dmg` into `release/`                 |
| `npm run dist:win`  | Build a Windows `.exe` (NSIS installer) into `release/` |
| `npm run dist`      | Build both installers                                |
| `npm run pack`      | Package an unpacked app dir (fast sanity check)      |

## Packaging

Uses [`electron-builder`](https://www.electron.build/) (config in
`electron-builder.yml`); installers are written to `release/`.

- **macOS** — `npm run dist:mac` produces an unsigned `.dmg` (arch matches the
  host; Apple Silicon → arm64). No Apple Developer certificate needed for local
  builds (`mac.identity: null`).
- **Windows** — `npm run dist:win` produces an x64 NSIS `.exe`. On macOS this
  works out of the box: electron-builder downloads a bundled Wine to run the NSIS
  compiler. (Building on Windows or CI also works.)
- No app icons are set yet, so the default Electron icon is used. Drop
  `build/icon.icns` / `build/icon.ico` and uncomment the `icon:` lines in
  `electron-builder.yml` to customize.

## Project structure

```
sample-logs/    bundled sample log tailed on startup
src/
├── shared/     framework-free model + log parsing (used by main and renderer)
│   ├── models.ts          GrpcCall / GrpcMessage data model + LogSnapshot
│   ├── logParser.ts       line regex, name→service/method/type, payload parsing
│   └── callCorrelator.ts  FIFO grouping of lines into calls (stateful)
├── main/       Electron main process (lifecycle, windows, IPC, prod CSP)
│   └── logSource.ts       read file + fs.watch live-tail + push snapshots
├── preload/    contextBridge — the only API surface exposed to the renderer
└── renderer/
    ├── index.html
    └── src/
        ├── main.tsx        React entry
        ├── App.tsx         subscribes to log snapshots + layout
        ├── format.ts       display helpers (bytes, duration, status)
        ├── types.ts        re-exports the shared model
        └── components/      Toolbar, RequestList, DetailPanel, JsonTree, badges
```

### Log format & parsing

Network lines look like:

```
[<date time>]<ignored>[<IN|OUT>] <Name> <payload>
```

Handled in `src/shared/logParser.ts` and `callCorrelator.ts`:

- **Filtering** — only lines whose `<Name>` ends in `Request`/`Response` are kept;
  everything else is noise.
- **Direction** — `OUT` = request, `IN` = response.
- **Type** — a name containing `Stream` is server-streaming, otherwise unary.
- **Service/method** — strip `Stream` and the `Request`/`Response` suffix
  (`GetAccountInfoRequest` → method `GetAccountInfo`, service `GetAccountInfoService`).
- **Correlation** — FIFO per name: each request opens a call; the next matching
  response(s) complete the oldest open call for that name, so repeated calls stay
  separate. Streams keep attaching responses until superseded.
- **Overrides** — request/response names that don't share a base name are mapped
  explicitly via `REQUEST_RESPONSE_OVERRIDES` in `logParser.ts`.
- **Payloads** — parsed with JSON5 (single quotes ok); on failure, a string-aware
  normalizer converts Python-repr `dict`s (`True`/`False`/`None`, `b'…'`/`r'…'`
  prefixes) before a retry, falling back to the raw string if still unparseable.
- **Outcome** — success/failure is derived from the response payload's top-level
  key (`success` vs `failure`/`error`).

Built with [`electron-vite`](https://electron-vite.org/). Output goes to `out/`.

### Security model

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- The renderer cannot access Node directly. Privileged operations go through
  IPC: expose a method in `src/preload/index.ts` (typed via its exported `Api`)
  and handle it with `ipcMain.handle(...)` in `src/main/index.ts`.
- A restrictive Content-Security-Policy is applied via response headers in the
  packaged app (relaxed in dev so Vite HMR works).
