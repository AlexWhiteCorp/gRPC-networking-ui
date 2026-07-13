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
  // Narrow = not enough room for list + detail side by side. In that case the
  // detail panel opens as a right-side overlay on top of the list.
  const [narrow, setNarrow] = useState(false);

  // Subscribe to log snapshots pushed from the main process. The app starts
  // empty; use "Open log file…" to pick a file to tail.
  // (Startup sample load disabled for now — re-enable with
  //  `void window.api.loadSampleLog();` here.)
  useEffect(() => {
    const unsubscribe = window.api.onLogSnapshot((snapshot) => {
      setCalls(snapshot.calls);
      setSourceLabel(snapshot.sourceLabel);
      if (snapshot.reset) setSelectedId(null);
    });
    return unsubscribe;
  }, []);

  // Track whether the window is too narrow to show both panes.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const update = (): void => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
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
    // Reset the main-process correlator too, so newly appended lines don't
    // bring the whole history back on the next snapshot. The authoritative
    // empty snapshot comes back over onLogSnapshot; clear locally for snappiness.
    setCalls([]);
    setSelectedId(null);
    void window.api.clearLog();
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
        {/* Detail is hidden until a request is selected. When there isn't room
            for both panes, it opens as a right-side overlay on top of the list. */}
        {selected && (
          <div className={`pane pane-detail${narrow ? ' pane-detail-overlay' : ''}`}>
            <DetailPanel call={selected} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
