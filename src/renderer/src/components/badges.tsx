import { RPC_TYPE_LABEL, type GrpcStatus, type RpcType } from '@/types';
import { isErrorStatus, statusCode } from '@/format';

export function StatusBadge({ status }: { status: GrpcStatus }): JSX.Element {
  const kind = isErrorStatus(status) ? 'error' : 'ok';
  return (
    <span className={`badge badge-status badge-${kind}`} title={status}>
      <span className="badge-code">{statusCode(status)}</span>
      {status}
    </span>
  );
}

const TYPE_ICON: Record<RpcType, string> = {
  unary: '→',
  'server-streaming': '↠',
  'client-streaming': '↞',
  bidi: '⇄',
};

export function TypeBadge({ type }: { type: RpcType }): JSX.Element {
  return (
    <span className="badge badge-type" title={RPC_TYPE_LABEL[type]}>
      <span className="badge-icon">{TYPE_ICON[type]}</span>
      {RPC_TYPE_LABEL[type]}
    </span>
  );
}

export function OutcomeBadge({
  outcome,
}: {
  outcome?: 'success' | 'failure';
}): JSX.Element {
  if (!outcome) {
    return <span className="badge badge-muted" title="No response yet">—</span>;
  }
  const ok = outcome === 'success';
  return (
    <span className={`badge badge-${ok ? 'ok' : 'error'}`}>
      {ok ? '✓ Success' : '✗ Failure'}
    </span>
  );
}
