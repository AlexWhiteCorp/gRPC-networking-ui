import type { GrpcCall } from '@/types';
import { formatBytes, formatClockTime, formatDuration, isErrorStatus } from '@/format';
import { OutcomeBadge, StatusBadge, TypeBadge } from './badges';

interface RequestListProps {
  calls: GrpcCall[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RequestList({ calls, selectedId, onSelect }: RequestListProps): JSX.Element {
  if (calls.length === 0) {
    return (
      <div className="list-empty">
        <p>No gRPC calls to show.</p>
        <p className="list-empty-hint">Adjust the filters, or the list has been cleared.</p>
      </div>
    );
  }

  return (
    <div className="list-scroll">
      <table className="request-table">
        <thead>
          <tr>
            <th className="col-method">Method</th>
            <th className="col-type">Type</th>
            <th className="col-status">Status</th>
            <th className="col-result">Result</th>
            <th className="col-num">Size</th>
            <th className="col-num">Time</th>
            <th className="col-num">Duration</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr
              key={call.id}
              className={
                (selectedId === call.id ? 'row-selected ' : '') +
                (isErrorStatus(call.status) || call.outcome === 'failure'
                  ? 'row-error'
                  : '')
              }
              onClick={() => onSelect(call.id)}
            >
              <td className="col-method">
                <span className="method-service">{call.service}/</span>
                <span className="method-name">{call.method}</span>
              </td>
              <td className="col-type">
                <TypeBadge type={call.type} />
              </td>
              <td className="col-status">
                <StatusBadge status={call.status} />
              </td>
              <td className="col-result">
                <OutcomeBadge outcome={call.outcome} />
              </td>
              <td className="col-num">{formatBytes(call.sizeBytes)}</td>
              <td className="col-num">{formatClockTime(call.startTime)}</td>
              <td className="col-num">{formatDuration(call.durationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
