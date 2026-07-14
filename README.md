# gRPC Networking UI

A desktop app that inspects gRPC traffic like a browser's **Network tab** — but
for gRPC. Point it at a log file your app writes, and it shows each call with its
request/response payloads, timing, and success/failure result. New log lines
appear **live** as they're written.

## What you can do

- **Browse calls** — a list of gRPC calls with service/method, type
  (unary / server-stream), **result** (success ✓ / failure ✗), size, time, and duration.
- **Filter** — by text (service/method), RPC type, or status.
- **Inspect** — click a call to see its metadata, messages, and timing. Payloads
  render as a collapsible **JSON tree**.
- **Live tail** — pick a log file and new lines stream in automatically (~100 ms).
- **Clear** — wipe the list while continuing to tail (only later lines show up).

---

## Getting started

There are two ways to run it. Most people want **Option 1**.

### Option 1 — Run from source

**Prerequisites**

- [**Node.js**](https://nodejs.org/) **20 or newer** (includes `npm` 10+)

Check your versions:

```bash
node --version   # v20.x or newer
npm --version    # 10.x or newer
```

**Run it**

```bash
npm install      # first time only
npm run dev
```

**Also you can build your own installer (optional)**

```bash
npm run dist:mac   # -> release/mac-arm64/
```

---

## Using the app

1. Click **Open log file…** and choose the `.txt` log your application writes.
2. The list fills with gRPC calls and keeps updating as the file grows.
3. Click any row to inspect its request/response payloads, metadata, and timing.
4. Use the filters to narrow the list, or **Clear** to reset it.
