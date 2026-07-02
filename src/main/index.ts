import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { LogSource } from './logSource';

const isDev = !app.isPackaged;

// A restrictive Content-Security-Policy for the packaged app. It is intentionally
// not applied in dev, where Vite's HMR relies on inline scripts.
const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;";

let mainWindow: BrowserWindow | null = null;
let logSource: LogSource | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // electron-vite injects the dev server URL in development; load the built
  // file in production.
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  logSource = new LogSource((snapshot) => {
    mainWindow?.webContents.send('logs:snapshot', snapshot);
  });

  mainWindow.on('closed', () => {
    logSource?.dispose();
    logSource = null;
    mainWindow = null;
  });
}

// Example IPC handler — invoked from the renderer via window.api.getAppVersion().
ipcMain.handle('app:getVersion', () => app.getVersion());

// Log-source handlers. The renderer subscribes to 'logs:snapshot' pushes.
ipcMain.handle('logs:openFile', () => logSource?.openDialog(mainWindow) ?? null);
ipcMain.handle('logs:loadSample', () => logSource?.loadSample());

app.whenReady().then(() => {
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [PROD_CSP],
        },
      });
    });
  }

  createWindow();

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
