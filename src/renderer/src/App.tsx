import { useEffect, useMemo, useState } from 'react';
import type { GrpcCall, RpcType } from '@/types';
import { isErrorStatus } from '@/format';
import { Toolbar, type StatusFilter } from '@/components/Toolbar';
import { RequestList } from '@/components/RequestList';
import { DetailPanel } from '@/components/DetailPanel';

export function App(): JSX.Element {
  const [calls, setCalls] = useState<GrpcCall[]>([]);
  const [sourceLabel, setSourceLabel] = useState('no source');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<RpcType>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Subscribe to log snapshots pushed from the main process, and load the
  // bundled sample once on startup.
  useEffect(() => {
    const unsubscribe = window.api.onLogSnapshot((snapshot) => {
      setCalls(snapshot.calls);
      setSourceLabel(snapshot.sourceLabel);
      if (snapshot.reset) setSelectedId(null);
    });
    void window.api.loadSampleLog();
    return unsubscribe;
  }, []);

  const filtered = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    return calls.filter((call) => {
      if (activeTypes.size > 0 && !activeTypes.has(call.type)) return false;
      if (statusFilter === 'ok' && isErrorStatus(call.status)) return false;
      if (statusFilter === 'error' && !isErrorStatus(call.status)) return false;
      if (needle) {
        const haystack = `${call.service}/${call.method}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [calls, filterText, activeTypes, statusFilter]);

  const selected = useMemo(
    () => filtered.find((c) => c.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  function toggleType(type: RpcType): void {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function clearList(): void {
    setCalls([]);
    setSelectedId(null);
  }

  async function openFile(): Promise<void> {
    await window.api.openLogFile();
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1 className="app-title">gRPC Networking UI</h1>
        <span className="app-badge" title="Current log source">
          {sourceLabel}
        </span>
      </header>

      <Toolbar
        filterText={filterText}
        onFilterText={setFilterText}
        activeTypes={activeTypes}
        onToggleType={toggleType}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        onClear={clearList}
        onOpenFile={openFile}
        shownCount={filtered.length}
        totalCount={calls.length}
      />

      <div className="workspace">
        <div className="pane pane-list">
          <RequestList
            calls={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <div className="pane pane-detail">
          <DetailPanel call={selected} />
        </div>
      </div>
    </div>
  );
}
