import { useState } from 'react';
import type { GrpcCall, GrpcMessage } from '@/types';
import { RPC_TYPE_LABEL } from '@/types';
import {
  formatBytes,
  formatClockTime,
  formatDuration,
  isErrorStatus,
  statusCode,
} from '@/format';
import { OutcomeBadge, StatusBadge } from './badges';
import { JsonTree } from './JsonTree';

type Tab = 'metadata' | 'messages' | 'timing' | 'status';

const TABS: { id: Tab; label: string }[] = [
  { id: 'metadata', label: 'Metadata' },
  { id: 'messages', label: 'Messages' },
  { id: 'timing', label: 'Timing' },
  { id: 'status', label: 'Status' },
];

export function DetailPanel({
  call,
  onClose,
}: {
  call: GrpcCall | null;
  onClose?: () => void;
}): JSX.Element | null {
  const [tab, setTab] = useState<Tab>('metadata');

  if (!call) return null;

  return (
    <div className="detail">
      <header className="detail-header">
        <div className="detail-header-top">
          <div className="detail-title">
            <span className="method-service">{call.service}/</span>
            <span className="method-name">{call.method}</span>
          </div>
          {onClose && (
            <button
              className="detail-close"
              onClick={onClose}
              title="Close details"
              aria-label="Close details"
            >
              ✕
            </button>
          )}
        </div>
        <div className="detail-subtitle">
          <StatusBadge status={call.status} />
          {call.outcome && <OutcomeBadge outcome={call.outcome} />}
          {call.pending && <span className="pending-pill">pending…</span>}
          <span className="detail-meta">{RPC_TYPE_LABEL[call.type]}</span>
          {call.authority && <span className="detail-meta">{call.authority}</span>}
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'messages' && (
              <span className="tab-count">{call.messages.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="tab-panel">
        {tab === 'metadata' && <MetadataTab call={call} />}
        {tab === 'messages' && <MessagesTab messages={call.messages} />}
        {tab === 'timing' && <TimingTab call={call} />}
        {tab === 'status' && <StatusTab call={call} />}
      </div>
    </div>
  );
}

function KeyValueTable({ data }: { data: Record<string, string> }): JSX.Element {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <p className="kv-empty">— none —</p>;
  }
  return (
    <table className="kv-table">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td className="kv-key">{key}</td>
            <td className="kv-value">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MetadataTab({ call }: { call: GrpcCall }): JSX.Element {
  return (
    <div className="section-stack">
      <section>
        <h3 className="section-title">Request metadata</h3>
        <KeyValueTable data={call.requestMetadata} />
      </section>
      <section>
        <h3 className="section-title">Response headers</h3>
        <KeyValueTable data={call.responseHeaders} />
      </section>
      <section>
        <h3 className="section-title">Trailers</h3>
        <KeyValueTable data={call.trailers} />
      </section>
    </div>
  );
}

function MessagesTab({ messages }: { messages: GrpcMessage[] }): JSX.Element {
  return (
    <div className="section-stack">
      {messages.map((msg, i) => (
        <section key={i} className="message">
          <div className="message-head">
            <span className={`dir dir-${msg.direction}`}>
              {msg.direction === 'sent' ? '▲ sent' : '▼ received'}
            </span>
            {msg.name && <span className="message-name">{msg.name}</span>}
            <span className="message-offset">+{msg.offsetMs} ms</span>
          </div>
          <JsonTree value={msg.payload} />
        </section>
      ))}
    </div>
  );
}

function TimingTab({ call }: { call: GrpcCall }): JSX.Element {
  const total = Math.max(call.durationMs, 1);
  return (
    <div className="section-stack">
      <section>
        <h3 className="section-title">Summary</h3>
        <table className="kv-table">
          <tbody>
            <tr>
              <td className="kv-key">Started</td>
              <td className="kv-value">{formatClockTime(call.startTime)}</td>
            </tr>
            <tr>
              <td className="kv-key">Duration</td>
              <td className="kv-value">{formatDuration(call.durationMs)}</td>
            </tr>
            {call.deadlineMs !== undefined && (
              <tr>
                <td className="kv-key">Deadline</td>
                <td className="kv-value">{formatDuration(call.deadlineMs)}</td>
              </tr>
            )}
            <tr>
              <td className="kv-key">Total size</td>
              <td className="kv-value">{formatBytes(call.sizeBytes)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="section-title">Message waterfall</h3>
        <div className="waterfall">
          {call.messages.map((msg, i) => (
            <div key={i} className="wf-row">
              <span className={`wf-label dir-${msg.direction}`}>
                {msg.direction === 'sent' ? '▲' : '▼'} {msg.offsetMs} ms
              </span>
              <div className="wf-track">
                <span
                  className={`wf-marker dir-${msg.direction}`}
                  style={{ left: `${(msg.offsetMs / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatusTab({ call }: { call: GrpcCall }): JSX.Element {
  return (
    <div className="section-stack">
      <div className={`status-callout ${isErrorStatus(call.status) ? 'is-error' : 'is-ok'}`}>
        <div className="status-callout-code">{statusCode(call.status)}</div>
        <div>
          <div className="status-callout-name">{call.status}</div>
          {call.statusMessage && (
            <div className="status-callout-msg">{call.statusMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}
