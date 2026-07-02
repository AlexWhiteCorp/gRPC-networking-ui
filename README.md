# gRPC Networking UI

Desktop application (Electron + React + TypeScript) for inspecting gRPC traffic —
a "Network tab" for gRPC. Shows executed calls with their payloads, responses,
metadata, status, and timing.

> **Status:** log-ingestion phase. The request list is built from a text log
> written by another app: network lines are parsed and correlated into calls,
> and the selected file is **live-tailed** (new appended lines stream in). A
> bundled sample (`sample-logs/sample.txt`) loads on startup; use **Open log
> file…** to tail any file. There is no direct gRPC capture yet.

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

## Project structure

```
sample-logs/    bundled sample log tailed on startup
src/
├── shared/     framework-free model + log parsing (used by main and renderer)
│   ├── models.ts          GrpcCall / GrpcMessage data model + LogSnapshot
│   ├── logParser.ts       parse/derive service·method·type from a log line
│   └── callCorrelator.ts  FIFO grouping of lines into calls (stateful)
├── main/       Electron main process (lifecycle, windows, IPC, prod CSP)
│   └── logSource.ts       read file + fs.watch live-tail + push snapshots
├── preload/    contextBridge — the only API surface exposed to the renderer
└── renderer/
    ├── index.html
    └── src/
        ├── main.tsx        React entry
        ├── App.tsx         subscribes to log snapshots + layout
        ├── types.ts        re-exports the shared model
        └── components/      Toolbar, RequestList, DetailPanel, ...
```

### Log format

Network lines look like:

```
[<date time>]<ignored>[<IN|OUT>] <Name> <json payload>
```

Only lines whose `<Name>` ends in `Request`/`Response` are kept (others are
noise). `OUT`=request, `IN`=response. A name containing `Stream` is
server-streaming, otherwise unary. The service/method are derived by stripping
`Stream` and the `Request`/`Response` suffix (`GetAccountInfoRequest` →
method `GetAccountInfo`, service `GetAccountInfoService`). A request is paired
with its following response(s) FIFO per name, so repeated calls stay separate.

Built with [`electron-vite`](https://electron-vite.org/). Output goes to `out/`.

### Security model

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- The renderer cannot access Node directly. Privileged operations go through
  IPC: expose a method in `src/preload/index.ts` (typed via its exported `Api`)
  and handle it with `ipcMain.handle(...)` in `src/main/index.ts`.
- A restrictive Content-Security-Policy is applied via response headers in the
  packaged app (relaxed in dev so Vite HMR works).
