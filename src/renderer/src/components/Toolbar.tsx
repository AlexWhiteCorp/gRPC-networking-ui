import { RPC_TYPE_LABEL, type RpcType } from '@/types';

export type StatusFilter = 'all' | 'ok' | 'error';

const RPC_TYPES: RpcType[] = [
  'unary',
  'server-streaming',
  'client-streaming',
  'bidi',
];

interface ToolbarProps {
  filterText: string;
  onFilterText: (value: string) => void;
  activeTypes: Set<RpcType>;
  onToggleType: (type: RpcType) => void;
  statusFilter: StatusFilter;
  onStatusFilter: (value: StatusFilter) => void;
  onClear: () => void;
  onOpenFile: () => void;
  shownCount: number;
  totalCount: number;
}

export function Toolbar({
  filterText,
  onFilterText,
  activeTypes,
  onToggleType,
  statusFilter,
  onStatusFilter,
  onClear,
  onOpenFile,
  shownCount,
  totalCount,
}: ToolbarProps): JSX.Element {
  return (
    <div className="toolbar">
      <button className="btn" onClick={onOpenFile} title="Open a log file to tail">
        📂 Open log file…
      </button>
      <button className="btn" onClick={onClear} title="Clear the request list">
        ⃠ Clear
      </button>

      <input
        className="filter-input"
        type="search"
        placeholder="Filter by service or method…"
        value={filterText}
        onChange={(e) => onFilterText(e.target.value)}
      />

      <div className="chip-group" role="group" aria-label="RPC type filter">
        {RPC_TYPES.map((type) => (
          <button
            key={type}
            className={`chip ${activeTypes.has(type) ? 'chip-active' : ''}`}
            onClick={() => onToggleType(type)}
          >
            {RPC_TYPE_LABEL[type]}
          </button>
        ))}
      </div>

      <select
        className="status-select"
        value={statusFilter}
        onChange={(e) => onStatusFilter(e.target.value as StatusFilter)}
        aria-label="Status filter"
      >
        <option value="all">All status</option>
        <option value="ok">OK only</option>
        <option value="error">Errors only</option>
      </select>

      <span className="toolbar-count">
        {shownCount} / {totalCount}
      </span>
    </div>
  );
}
