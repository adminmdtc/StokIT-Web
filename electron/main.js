'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
let db;
try {
  db = require('./database');
  db.open();
  console.log('SQLite database opened:', db.DB_PATH);
} catch (e) {
  console.warn('SQLite not available, using localStorage fallback:', e.message);
  db = null;
}

let mainWindow;
let updater;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'IT Stock — ระบบบริหารจัดการวัสดุ',

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));

  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Custom menu
  const menuTemplate = [
    {
      label: 'ไฟล์',
      submenu: [
        { label: 'ออกจากโปรแกรม', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'มุมมอง',
      submenu: [
        { label: 'รีเฟรช', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
        { label: 'DevTools', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'ขยายเต็มจอ', accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
      ],
    },
    {
      label: 'ช่วยเหลือ',
      submenu: [
        { label: 'ตรวจสอบอัพเดท...', accelerator: 'CmdOrCtrl+U', click: () => checkUpdate() },
        { type: 'separator' },
        { label: 'เกี่ยวกับ IT Stock', click: () => showAbout() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  // Auto-update check disabled by default — user can check manually from Help menu
  // To re-enable, uncomment the lines below:
  // setTimeout(() => {
  //   if (mainWindow) checkUpdate();
  // }, 3000);
}

// === Auto Update ===

function checkUpdate() {
  if (!updater) {
    updater = require('./updater');
  }
  updater.checkForUpdates(mainWindow);
}

// === Database IPC Handlers ===
function withDb(fn, fallback) {
  if (!db) return fallback !== undefined ? fallback : { ok: false, error: 'SQLite not available' };
  return fn();
}
ipcMain.handle('db:getAll', (_e, table) => withDb(() => db.getAll(table), []));
ipcMain.handle('db:getById', (_e, table, id) => withDb(() => db.getById(table, id), null));
ipcMain.handle('db:getMeta', (_e, key) => withDb(() => db.getMeta(key), null));
ipcMain.handle('db:upsert', (_e, table, row) => withDb(() => { db.upsert(table, row); return { ok: true }; }));
ipcMain.handle('db:insert', (_e, table, row) => withDb(() => { db.insert(table, row); return { ok: true }; }));
ipcMain.handle('db:update', (_e, table, id, row) => withDb(() => { db.update(table, id, row); return { ok: true }; }));
ipcMain.handle('db:remove', (_e, table, id) => withDb(() => { db.remove(table, id); return { ok: true }; }));
ipcMain.handle('db:clearTable', (_e, table) => withDb(() => { db.clearTable(table); return { ok: true }; }));
ipcMain.handle('db:setMeta', (_e, key, value) => withDb(() => { db.setMeta(key, value); return { ok: true }; }));
ipcMain.handle('db:saveAll', (_e, data) => withDb(() => {
  const { items = [], transactions = [], users = [], reorderItems = [] } = data;
  db.clearTable('items'); items.forEach(r => db.upsert('items', r));
  db.clearTable('transactions'); transactions.forEach(r => db.upsert('transactions', r));
  db.clearTable('users'); users.forEach(r => db.upsert('users', r));
  db.clearTable('reorder_items'); reorderItems.forEach(r => db.upsert('reorder_items', r));
  return { ok: true };
}));
ipcMain.handle('db:loadAll', () => withDb(() => ({
  items: db.getAll('items'),
  transactions: db.getAll('transactions'),
  users: db.getAll('users'),
  reorderItems: db.getAll('reorder_items'),
}), { items: [], transactions: [], users: [], reorderItems: [] }));
ipcMain.handle('db:path', () => withDb(() => db.DB_PATH, ''));

// IPC handlers สำหรับ update window
ipcMain.on('start-download', () => {
  if (updater) {
    updater.autoUpdater.downloadUpdate();
  }
});

ipcMain.on('restart-app', () => {
  if (updater) {
    updater.autoUpdater.quitAndInstall(false, true);
  }
});

ipcMain.on('close-update-window', () => {
  // ปิดหน้าต่างอัพเดทจะถูกจัดการใน updater.js
});

// === About Dialog ===

function showAbout() {
  const pkg = require('./package.json');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'เกี่ยวกับ IT Stock',
    message: 'IT Stock — ระบบบริหารจัดการวัสดุ',
    detail: `เวอร์ชัน ${pkg.version}\nกลุ่มงานเทคโนโลยีสารสนเทศ\nโรงพยาบาลธัญญารักษ์แม่ฮ่องสอน`,
    buttons: ['ตกลง'],
  });
}

// === App Lifecycle ===

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  try { if (db) db.close(); } catch (e) { /* ignore */ }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { if (db) db.close(); } catch (e) { /* ignore */ }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
