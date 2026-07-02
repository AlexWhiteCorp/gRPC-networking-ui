import type { GrpcCall, GrpcMessage } from './models';
import { parseLogLine, type ParsedEntry } from './logParser';

/**
 * Turns a stream of log lines into correlated `GrpcCall`s.
 *
 * Grouping is FIFO per correlation key: each request opens a new call; the next
 * matching response(s) complete the oldest still-open call for that key. This
 * keeps repeated same-name calls (e.g. many `GetProductByIdRequest`) as separate
 * entries. A server-streaming call keeps attaching responses until the next
 * request with the same key supersedes it. The key comes from `deriveName`, so
 * `REQUEST_RESPONSE_OVERRIDES` can group differently-named request/response pairs.
 *
 * The instance is stateful across `ingestLines` calls so it can be fed appended
 * lines while live-tailing a file. Call `reset()` when switching files.
 */
export class CallCorrelator {
  private calls = new Map<string, GrpcCall>();
  private order: string[] = [];
  /** Queue of open call ids awaiting/receiving responses, keyed by correlation key. */
  private openByKey = new Map<string, string[]>();
  private counter = 0;
  /** Monotonic clock used when a log timestamp is missing/unparseable. */
  private lastTime = 0;

  reset(): void {
    this.calls.clear();
    this.order = [];
    this.openByKey.clear();
    this.counter = 0;
    this.lastTime = 0;
  }

  ingestLines(lines: Iterable<string>): void {
    for (const line of lines) {
      const entry = parseLogLine(line);
      if (entry) this.ingestEntry(entry);
    }
  }

  /** Current calls, ordered by start time. */
  snapshot(): GrpcCall[] {
    return this.order
      .map((id) => this.calls.get(id)!)
      .sort((a, b) => a.startTime - b.startTime);
  }

  private ingestEntry(entry: ParsedEntry): void {
    const time = this.resolveTime(entry.timestamp);
    if (entry.kind === 'request') {
      this.openRequest(entry, time);
    } else {
      this.completeWithResponse(entry, time);
    }
  }

  private openRequest(entry: ParsedEntry, time: number): void {
    // A new request supersedes any open server-stream with the same key.
    const open = this.openByKey.get(entry.correlationKey);
    if (open) {
      for (let i = open.length - 1; i >= 0; i--) {
        const call = this.calls.get(open[i])!;
        if (call.type === 'server-streaming') {
          call.pending = false;
          open.splice(i, 1);
        }
      }
    }

    const id = `call-${++this.counter}`;
    const call: GrpcCall = {
      id,
      service: entry.service,
      method: entry.method,
      type: entry.type,
      status: 'OK',
      pending: true,
      startTime: time,
      durationMs: 0,
      authority: '',
      requestMetadata: {},
      responseHeaders: {},
      trailers: {},
      messages: [makeMessage(entry, 0)],
      sizeBytes: entry.payloadBytes,
    };
    this.calls.set(id, call);
    this.order.push(id);
    this.enqueue(entry.correlationKey, id);
  }

  private completeWithResponse(entry: ParsedEntry, time: number): void {
    const queue = this.openByKey.get(entry.correlationKey);
    const openId = queue?.[0];

    if (!openId) {
      // Response with no matching open request — surface it as its own call.
      const id = `call-${++this.counter}`;
      const call: GrpcCall = {
        id,
        service: entry.service,
        method: entry.method,
        type: entry.type,
        status: 'OK',
        pending: false,
        statusMessage: 'response without a matching request',
        startTime: time,
        durationMs: 0,
        authority: '',
        requestMetadata: {},
        responseHeaders: {},
        trailers: {},
        messages: [makeMessage(entry, 0)],
        sizeBytes: entry.payloadBytes,
        outcome: outcomeFromPayload(entry.payload),
      };
      this.calls.set(id, call);
      this.order.push(id);
      return;
    }

    const call = this.calls.get(openId)!;
    call.messages.push(makeMessage(entry, time - call.startTime));
    call.sizeBytes += entry.payloadBytes;
    call.durationMs = Math.max(0, time - call.startTime);
    applyOutcome(call, entry.payload);

    if (call.type === 'unary') {
      // Unary is done after its single response.
      call.pending = false;
      queue!.shift();
    }
    // Server-streaming stays open (pending) to accept further responses.
  }

  private enqueue(key: string, id: string): void {
    const queue = this.openByKey.get(key);
    if (queue) queue.push(id);
    else this.openByKey.set(key, [id]);
  }

  /** Use the log timestamp when valid; otherwise fall back to a monotonic clock
   *  so calls stay ordered by arrival and offsets stay non-negative. */
  private resolveTime(ts: number): number {
    const time = Number.isNaN(ts) ? this.lastTime + 1 : ts;
    this.lastTime = Math.max(this.lastTime, time);
    return time;
  }
}

/** Derive success/failure from a response payload's top-level key. gRPC-style
 *  responses wrap their body in a oneof, e.g. { success: {...} } / { failure: {...} }. */
function outcomeFromPayload(payload: unknown): 'success' | 'failure' | undefined {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const keys = Object.keys(payload);
    if (keys.includes('failure') || keys.includes('error')) return 'failure';
    if (keys.includes('success')) return 'success';
  }
  return undefined;
}

/** Update a call's outcome from a new response. A failure sticks (so a stream
 *  that fails once stays failed); otherwise the latest known outcome wins. */
function applyOutcome(call: GrpcCall, payload: unknown): void {
  if (call.outcome === 'failure') return;
  const outcome = outcomeFromPayload(payload);
  if (outcome) call.outcome = outcome;
}

function makeMessage(entry: ParsedEntry, offsetMs: number): GrpcMessage {
  return {
    direction: entry.direction === 'OUT' ? 'sent' : 'received',
    offsetMs: Math.max(0, offsetMs),
    payload: entry.payload,
    name: entry.name,
  };
}
