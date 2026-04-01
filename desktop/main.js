const path = require('node:path');
const { app, BrowserWindow, shell } = require('electron');
const { updateElectronApp, UpdateSourceType } = require('update-electron-app');

const APP_URL = process.env.TERMINAL_CLAW_APP_URL || 'https://terminal-claw.example.com:23333';
const APP_ORIGIN = new URL(APP_URL).origin;

function setupAutoUpdates() {
  if (!app.isPackaged) {
    return;
  }

  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: 'your-org/terminal-claw'
    },
    updateInterval: '10 minutes',
    notifyUser: true,
    logger: console
  });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#141414',
    title: 'terminal-claw',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(APP_URL);
  return win;
}

app.whenReady().then(() => {
  setupAutoUpdates();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
