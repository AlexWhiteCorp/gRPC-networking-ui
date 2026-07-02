import { contextBridge, ipcRenderer } from 'electron';
import type { LogSnapshot } from '../shared/models';

// Expose a minimal, explicit API surface to the renderer.
// Add new methods here rather than exposing ipcRenderer directly.
const api = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  /** Open a native picker and start tailing the chosen file. Returns its path. */
  openLogFile: (): Promise<string | null> => ipcRenderer.invoke('logs:openFile'),

  /** Load (and tail) the bundled sample log. */
  loadSampleLog: (): Promise<void> => ipcRenderer.invoke('logs:loadSample'),

  /** Subscribe to log snapshots pushed from the main process while tailing.
   *  Returns an unsubscribe function. */
  onLogSnapshot: (callback: (snapshot: LogSnapshot) => void): (() => void) => {
    const listener = (_event: unknown, snapshot: LogSnapshot): void =>
      callback(snapshot);
    ipcRenderer.on('logs:snapshot', listener);
    return () => ipcRenderer.removeListener('logs:snapshot', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
