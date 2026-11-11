const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const APP_ID = 'com.luma.projectdesk';
app.setAppUserModelId(APP_ID);
app.setName('Luma');

let mainWindow = null;
let widgetWindow = null;
let tray = null;
let isQuitting = false;
let widgetExpanded = false;
let widgetCorner = 'right-bottom';
let widgetOpacity = 0.94;
let widgetWidth = 320;

function widgetBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = widgetWidth;
  const height = widgetExpanded ? 540 : 205;
  const [horizontal, vertical] = widgetCorner.split('-');
  return {
    x: horizontal === 'left' ? area.x + 18 : area.x + area.width - width - 18,
    y: vertical === 'top' ? area.y + 18 : area.y + area.height - height - 18,
    width,
    height,
  };
}

function applyWidgetBounds() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.setBounds(widgetBounds());
  widgetWindow.setOpacity(widgetOpacity);
}

function createWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.showInactive();
    mainWindow?.webContents.send('widget:visibility', true);
    return;
  }
  widgetWindow = new BrowserWindow({
    ...widgetBounds(),
    title: 'Luma Widget',
    icon: path.join(__dirname, 'icon.ico'),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  widgetWindow.setAlwaysOnTop(true, 'floating');
  widgetWindow.setOpacity(widgetOpacity);
  widgetWindow.loadFile(path.join(__dirname, 'index.html'), { query: { widget: '1' } });
  widgetWindow.once('ready-to-show', () => widgetWindow?.showInactive());
  widgetWindow.on('show', () => mainWindow?.webContents.send('widget:visibility', true));
  widgetWindow.on('hide', () => mainWindow?.webContents.send('widget:visibility', false));
  widgetWindow.on('closed', () => { widgetWindow = null; });
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 690,
    title: 'Luma — Proje Takip',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#f5f5f2',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    createWidget();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function showMainWindow(projectId) {
  const win = createMainWindow();
  const sendProject = () => {
    if (projectId) win.webContents.send('main:open-project', projectId);
  };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', sendProject);
  else sendProject();
  win.show();
  win.focus();
}

function startupTarget() {
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  return portableExe
    ? { path: portableExe, args: ['--startup-widget'] }
    : { path: process.execPath, args: app.isPackaged ? ['--startup-widget'] : [path.join(__dirname, 'main.cjs'), '--startup-widget'] };
}

function startupPreference() {
  try {
    const file = path.join(app.getPath('userData'), 'settings.json');
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    return settings.openAtLogin;
  } catch { return undefined; }
}

function setStartupEnabled(enabled) {
  if (process.platform !== 'win32') return;
  const target = startupTarget();
  app.setLoginItemSettings({ openAtLogin: enabled, path: target.path, args: target.args, enabled: true, name: 'Luma' });
  const file = path.join(app.getPath('userData'), 'settings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ openAtLogin: Boolean(enabled) }), 'utf8');
}

function startupEnabled() {
  if (process.platform !== 'win32') return false;
  const target = startupTarget();
  return app.getLoginItemSettings({ path: target.path, args: target.args }).openAtLogin;
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Luma’yı aç', click: () => showMainWindow() },
    { label: 'Widget’ı göster', click: () => createWidget() },
    { type: 'separator' },
    { label: 'Windows açılışında başlat', type: 'checkbox', checked: startupEnabled(), click: (item) => { setStartupEnabled(item.checked); buildTrayMenu(); } },
    { type: 'separator' },
    { label: 'Luma’dan çık', click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.ico'));
  tray = new Tray(icon);
  tray.setToolTip('Luma — Proje Takip');
  tray.on('click', () => showMainWindow());
  buildTrayMenu();
}

ipcMain.on('widget:show', () => createWidget());
ipcMain.on('widget:hide', () => widgetWindow?.hide());
ipcMain.on('widget:toggle-visibility', () => {
  if (!widgetWindow || widgetWindow.isDestroyed() || !widgetWindow.isVisible()) createWidget();
  else widgetWindow.hide();
});
ipcMain.on('widget:expand', (_event, expanded) => {
  widgetExpanded = Boolean(expanded);
  applyWidgetBounds();
  widgetWindow?.webContents.send('widget:expand', widgetExpanded);
});
ipcMain.on('widget:preference', (_event, key, value) => {
  if (key === 'corner' && ['left-bottom', 'right-bottom', 'left-top', 'right-top'].includes(value)) widgetCorner = value;
  if (key === 'opacity') widgetOpacity = Math.max(0.72, Math.min(1, Number(value) / 100));
  if (key === 'width') widgetWidth = Number(value) >= 360 ? 380 : 320;
  applyWidgetBounds();
});
ipcMain.on('main:open-project', (_event, projectId) => showMainWindow(projectId));

app.whenReady().then(() => {
  createTray();
  createWidget();
  if (!process.argv.includes('--startup-widget')) createMainWindow();
  if (process.platform === 'win32' && app.isPackaged) {
    const preference = startupPreference();
    setStartupEnabled(preference !== false);
    buildTrayMenu();
  }
  screen.on('display-metrics-changed', applyWidgetBounds);
  screen.on('display-added', applyWidgetBounds);
  screen.on('display-removed', applyWidgetBounds);
});

app.on('activate', () => showMainWindow());
app.on('window-all-closed', () => { /* Luma intentionally stays in the tray with its widget. */ });
app.on('before-quit', () => { isQuitting = true; });
