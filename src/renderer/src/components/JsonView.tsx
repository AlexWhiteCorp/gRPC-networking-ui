/** Read-only, pretty-printed JSON block. */
export function JsonView({ value }: { value: unknown }): JSX.Element {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return <pre className="json-view">{text}</pre>;
}
