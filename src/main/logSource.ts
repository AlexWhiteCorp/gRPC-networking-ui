import { app, dialog, type BrowserWindow } from 'electron';
import { watch, type FSWatcher } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { CallCorrelator } from '../shared/callCorrelator';
import type { LogSnapshot } from '../shared/models';

const SNAPSHOT_DEBOUNCE_MS = 50;

/**
 * Reads a log file, converts it to `GrpcCall`s via `CallCorrelator`, and keeps
 * watching the file so appended lines stream to the renderer (live tail).
 */
export class LogSource {
  private readonly correlator = new CallCorrelator();
  private watcher: FSWatcher | null = null;
  private currentPath: string | null = null;
  private sourceLabel = '';
  private offset = 0;
  private partial = '';
  private debounceTimer: NodeJS.Timeout | null = null;
  private opChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly send: (snapshot: LogSnapshot) => void) {}

  /** Serialize load/read operations so overlapping calls can't interleave and
   *  ingest the file twice — e.g. a watcher read arriving during a reload, or
   *  React StrictMode double-invoking the initial sample load in dev. */
  private runExclusive<T>(op: () => Promise<T>): Promise<T> {
    const result = this.opChain.then(op, op);
    this.opChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Show a native picker and load the chosen .txt. Returns the path or null. */
  async openDialog(window: BrowserWindow | null): Promise<string | null> {
    const options: Electron.OpenDialogOptions = {
      title: 'Open log file',
      properties: ['openFile'],
      filters: [
        { name: 'Text logs', extensions: ['txt', 'log'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    const path = result.filePaths[0];
    await this.loadFile(path, basename(path));
    return path;
  }

  /** Load the bundled sample log (dev: repo path, prod: resources). */
  async loadSample(): Promise<void> {
    const rel = join('sample-logs', 'sample.txt');
    const path = app.isPackaged
      ? join(process.resourcesPath, rel)
      : join(app.getAppPath(), rel);
    await this.loadFile(path, `${basename(path)} (sample)`);
  }

  dispose(): void {
    this.stopWatching();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  private loadFile(path: string, label: string): Promise<void> {
    return this.runExclusive(async () => {
      this.stopWatching();
      this.correlator.reset();
      this.offset = 0;
      this.partial = '';
      this.currentPath = path;
      this.sourceLabel = label;

      await this.readAppended();
      this.pushSnapshot(true);
      this.startWatching(path);
    });
  }

  private startWatching(path: string): void {
    try {
      this.watcher = watch(path, () => void this.onChange());
    } catch {
      // If watching fails (e.g. file removed), we keep whatever we've parsed.
      this.watcher = null;
    }
  }

  private stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private onChange(): void {
    // Serialized with loads and other reads; the debounce coalesces the pushes.
    void this.runExclusive(async () => {
      const changed = await this.readAppended();
      if (changed) this.scheduleSnapshot();
    });
  }

  /** Read bytes appended since the last offset; parse complete lines.
   *  Returns true if any new content was ingested. */
  private async readAppended(): Promise<boolean> {
    const path = this.currentPath;
    if (!path) return false;

    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      return false;
    }

    // File truncated/rotated in place → start over.
    if (size < this.offset) {
      this.correlator.reset();
      this.offset = 0;
      this.partial = '';
    }
    if (size === this.offset) return false;

    const length = size - this.offset;
    const buf = Buffer.allocUnsafe(length);
    const fh = await open(path, 'r');
    try {
      await fh.read(buf, 0, length, this.offset);
    } finally {
      await fh.close();
    }
    this.offset = size;

    const text = this.partial + buf.toString('utf8');
    const lines = text.split(/\r?\n/);
    this.partial = lines.pop() ?? ''; // trailing partial line (no newline yet)
    this.correlator.ingestLines(lines);
    return true;
  }

  private scheduleSnapshot(): void {
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.pushSnapshot(false);
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  private pushSnapshot(reset: boolean): void {
    this.send({
      sourceLabel: this.sourceLabel,
      calls: this.correlator.snapshot(),
      reset,
    });
  }
}
