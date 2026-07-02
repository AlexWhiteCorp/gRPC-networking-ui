import { useState } from 'react';

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Read-only, pretty-printed JSON block. When `collapsible` is set and the value
 * is longer than `previewLines`, only the first few lines are shown with a
 * Show more / Show less toggle.
 */
export function JsonView({
  value,
  collapsible = false,
  previewLines = 6,
}: {
  value: unknown;
  collapsible?: boolean;
  previewLines?: number;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const text = stringify(value);
  const lines = text.split('\n');
  const isLong = collapsible && lines.length > previewLines;
  const shown = isLong && !expanded ? lines.slice(0, previewLines).join('\n') : text;
  const hiddenCount = lines.length - previewLines;

  return (
    <div className="json-block">
      <pre className="json-view">
        {shown}
        {isLong && !expanded ? '\n  …' : ''}
      </pre>
      {isLong && (
        <button
          className="json-toggle"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {expanded ? '▲ Show less' : `▼ Show ${hiddenCount} more lines`}
        </button>
      )}
    </div>
  );
}
