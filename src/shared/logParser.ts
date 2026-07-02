import JSON5 from 'json5';
import type { RpcType } from './models';

export type Direction = 'IN' | 'OUT';
export type MessageKind = 'request' | 'response';

export interface ParsedEntry {
  /** Epoch milliseconds; NaN when the timestamp could not be parsed. */
  timestamp: number;
  rawTimestamp: string;
  direction: Direction;
  /** Original message name, e.g. "GetProductByIdRequest". */
  name: string;
  kind: MessageKind;
  /** Base name shared by a request and its response(s), e.g. "GetProductById". */
  baseName: string;
  service: string;
  method: string;
  type: RpcType;
  /** Decoded JSON payload, or the raw string when it isn't valid JSON. */
  payload: unknown;
  /** Byte length of the raw payload text. */
  payloadBytes: number;
}

// [<date time>]<anything>[<IN|OUT>] <Name> <payload...>
// The middle "<anything>" is skipped; we jump to the first [IN]/[OUT] marker.
const LINE_RE =
  /^\[(?<ts>[^\]]*)\].*?\[(?<dir>IN|OUT)\]\s+(?<name>\S+)\s+(?<payload>.+)$/;

function parseTimestamp(raw: string): number {
  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return direct;
  // Tolerate "YYYY-MM-DD HH:MM:SS(.mmm)" by turning the space into a T.
  const isoish = Date.parse(raw.replace(' ', 'T'));
  return isoish;
}

/** Derive service/method/type/kind from a message name. Returns null if the
 *  name is not a *Request/*Response (i.e. not a network log). */
export function deriveName(name: string): {
  kind: MessageKind;
  baseName: string;
  service: string;
  method: string;
  type: RpcType;
} | null {
  let kind: MessageKind;
  let base: string;
  if (name.endsWith('Request')) {
    kind = 'request';
    base = name.slice(0, -'Request'.length);
  } else if (name.endsWith('Response')) {
    kind = 'response';
    base = name.slice(0, -'Response'.length);
  } else {
    return null;
  }

  const type: RpcType = /Stream/.test(base) ? 'server-streaming' : 'unary';
  const cleanBase = base.replace(/Stream/g, '');

  return {
    kind,
    baseName: cleanBase,
    method: cleanBase,
    service: `${cleanBase}Service`,
    type,
  };
}

/** Parse one log line. Returns null for non-network lines (noise). */
export function parseLogLine(line: string): ParsedEntry | null {
  const m = LINE_RE.exec(line.trim());
  if (!m?.groups) return null;

  const { ts, dir, name, payload: payloadText } = m.groups;
  const derived = deriveName(name);
  if (!derived) return null;

  // Payloads in the real logs use JSON5 conventions (single-quoted keys/values),
  // which strict JSON.parse rejects. JSON5 accepts both; fall back to the raw
  // string only if it still can't be parsed.
  let payload: unknown;
  const trimmed = payloadText.trim();
  try {
    payload = JSON5.parse(trimmed);
  } catch {
    payload = trimmed;
  }

  return {
    timestamp: parseTimestamp(ts),
    rawTimestamp: ts,
    direction: dir as Direction,
    name,
    kind: derived.kind,
    baseName: derived.baseName,
    service: derived.service,
    method: derived.method,
    type: derived.type,
    payload,
    payloadBytes: byteLength(trimmed),
  };
}

/** UTF-8 byte length without depending on Node's Buffer (shared/browser-safe). */
function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  // Fallback (Node without global TextEncoder — unlikely on modern runtimes).
  return text.length;
}
