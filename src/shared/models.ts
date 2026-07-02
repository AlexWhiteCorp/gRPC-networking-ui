export type RpcType =
  | 'unary'
  | 'server-streaming'
  | 'client-streaming'
  | 'bidi';

// Canonical gRPC status codes (subset commonly seen). `statusCode` on a call is
// the numeric value; `status` is the name.
export type GrpcStatus =
  | 'OK'
  | 'CANCELLED'
  | 'UNKNOWN'
  | 'INVALID_ARGUMENT'
  | 'DEADLINE_EXCEEDED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_EXHAUSTED'
  | 'FAILED_PRECONDITION'
  | 'ABORTED'
  | 'UNIMPLEMENTED'
  | 'INTERNAL'
  | 'UNAVAILABLE'
  | 'UNAUTHENTICATED';

export const GRPC_STATUS_CODE: Record<GrpcStatus, number> = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  UNAUTHENTICATED: 16,
};

export interface GrpcMessage {
  direction: 'sent' | 'received';
  /** Milliseconds from the call start. */
  offsetMs: number;
  /** JSON-serializable decoded message body. */
  payload: unknown;
  /** Original message name from the log, e.g. "GetProductByIdRequest". */
  name?: string;
}

export interface GrpcCall {
  id: string;
  /** Fully-qualified service, e.g. "routeguide.RouteGuide". */
  service: string;
  /** Method name, e.g. "GetFeature". */
  method: string;
  type: RpcType;
  status: GrpcStatus;
  /** Human-readable status detail (present mainly on errors). */
  statusMessage?: string;
  /** Request seen, but no response yet (relevant while live-tailing). */
  pending?: boolean;
  /** Epoch milliseconds when the call started. */
  startTime: number;
  durationMs: number;
  /** Target host:port. Empty when the source is logs without connection info. */
  authority: string;
  /** Requested deadline in ms, if any. */
  deadlineMs?: number;
  requestMetadata: Record<string, string>;
  responseHeaders: Record<string, string>;
  trailers: Record<string, string>;
  /** Ordered messages: 1 for unary, N for streams. */
  messages: GrpcMessage[];
  /** Total payload size across all messages, in bytes. */
  sizeBytes: number;
}

export const RPC_TYPE_LABEL: Record<RpcType, string> = {
  unary: 'Unary',
  'server-streaming': 'Server stream',
  'client-streaming': 'Client stream',
  bidi: 'Bidirectional',
};

/** Payload pushed from the main process to the renderer on each log update. */
export interface LogSnapshot {
  /** Human label for the current source (sample name or opened file name). */
  sourceLabel: string;
  calls: GrpcCall[];
  /** True when this snapshot replaces the list (a new file was loaded). */
  reset: boolean;
}
