import JSON5 from 'json5';
import type { RpcType } from './models';

export type Direction = 'IN' | 'OUT';
export type MessageKind = 'request' | 'response';

/**
 * Overrides for request/response names that do NOT follow the common
 * "same base name" rule. Maps one request name to the response name(s) that
 * belong to the same call (1 request → N responses).
 *
 * Overridden calls are treated as server-streaming so they keep accepting every
 * mapped response. Add pairs here as you discover them, e.g.:
 *
 *   SpacePageRequest: ['SpacePageUpdatesResponse'],
 */
export const REQUEST_RESPONSE_OVERRIDES: Record<string, string[]> = {
  StreamSpacesPageRequest: ['StreamSpacesPageUpdatesResponse'],
};

// Reverse index: response name → the request name it correlates to.
const RESPONSE_TO_REQUEST: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [request, responses] of Object.entries(REQUEST_RESPONSE_OVERRIDES)) {
    for (const response of responses) map.set(response, request);
  }
  return map;
})();

export interface DerivedName {
  kind: MessageKind;
  /** Grouping key shared by a request and its response(s). */
  correlationKey: string;
  service: string;
  method: string;
  type: RpcType;
}

export interface ParsedEntry extends DerivedName {
  /** Epoch milliseconds; NaN when the timestamp could not be parsed. */
  timestamp: number;
  rawTimestamp: string;
  direction: Direction;
  /** Original message name, e.g. "GetProductByIdRequest". */
  name: string;
  /** Decoded payload (JSON5), or the raw string when it isn't parseable. */
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
  return Date.parse(raw.replace(' ', 'T'));
}

/** Strip the Request/Response suffix and any Stream, returning the clean base
 *  name and the default RPC type implied by the presence of "Stream". */
function stripToBase(name: string): { base: string; type: RpcType } {
  let base = name;
  if (name.endsWith('Request')) base = name.slice(0, -'Request'.length);
  else if (name.endsWith('Response')) base = name.slice(0, -'Response'.length);
  const type: RpcType = /Stream/.test(base) ? 'server-streaming' : 'unary';
  return { base: base.replace(/Stream/g, ''), type };
}

/** Derive service/method/type/kind + correlation key from a message name.
 *  Returns null if the name is not a *Request/*Response (i.e. not a network log). */
export function deriveName(name: string): DerivedName | null {
  let kind: MessageKind;
  if (name.endsWith('Request')) kind = 'request';
  else if (name.endsWith('Response')) kind = 'response';
  else return null;

  // Override: a request explicitly mapped to differently-named response(s).
  if (kind === 'request' && REQUEST_RESPONSE_OVERRIDES[name]) {
    const { base } = stripToBase(name);
    return {
      kind,
      correlationKey: name, // canonical key = the request name
      service: `${base}Service`,
      method: base,
      type: 'server-streaming',
    };
  }
  // Override: a response whose name maps back to a specific request.
  const mappedRequest = RESPONSE_TO_REQUEST.get(name);
  if (kind === 'response' && mappedRequest) {
    const { base } = stripToBase(mappedRequest);
    return {
      kind,
      correlationKey: mappedRequest,
      service: `${base}Service`,
      method: base,
      type: 'server-streaming',
    };
  }

  // Default rule: correlate by the shared clean base name.
  const { base, type } = stripToBase(name);
  return {
    kind,
    correlationKey: base,
    service: `${base}Service`,
    method: base,
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

  const trimmed = payloadText.trim();
  return {
    ...derived,
    timestamp: parseTimestamp(ts),
    rawTimestamp: ts,
    direction: dir as Direction,
    name,
    payload: parsePayload(trimmed),
    payloadBytes: byteLength(trimmed),
  };
}

/**
 * Parse a payload that may be JSON, JSON5 (single quotes), or a Python dict/repr.
 * Tries JSON5 first, then retries after normalizing Python-isms that sit outside
 * string values: True/False/None literals and string/bytes prefixes (b'…', r'…').
 * Falls back to the raw string if it still can't be parsed (e.g. truncated).
 */
function parsePayload(text: string): unknown {
  try {
    return JSON5.parse(text);
  } catch {
    // fall through to the Python-normalized retry
  }
  try {
    return JSON5.parse(normalizePythonLiterals(text));
  } catch {
    return text;
  }
}

const PYTHON_LITERALS: Record<string, string> = {
  True: 'true',
  False: 'false',
  None: 'null',
};
// Python string/bytes/raw prefixes (b'…', r'…', rb'…', …) — dropped so the
// literal becomes a plain string that JSON5 can parse.
const STRING_PREFIX = /^(?:b|r|u|rb|br|ru|ur)$/i;

/** Normalize Python-isms that only appear outside quoted strings, so string
 *  contents are never altered. Handles True/False/None and string/bytes prefixes. */
function normalizePythonLiterals(text: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < text.length) {
        out += text[++i]; // keep the escaped character verbatim
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
      const word = text.slice(i, j);
      // A string/bytes prefix directly before a quote (ignoring any gap) → drop it.
      if (STRING_PREFIX.test(word)) {
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k++;
        if (text[k] === "'" || text[k] === '"') {
          i = k - 1; // skip the prefix and any whitespace; keep the string
          continue;
        }
      }
      out += PYTHON_LITERALS[word] ?? word;
      i = j - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** UTF-8 byte length without depending on Node's Buffer (shared/browser-safe). */
function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  // Fallback (Node without global TextEncoder — unlikely on modern runtimes).
  return text.length;
}
