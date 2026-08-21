'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');

let mainWindow;
let updater;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'IT Stock — ระบบบริหารจัดการวัสดุ',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));

  // Open DevTools for debugging
  mainWindow.webContents.openDevTools({ mode: 'detach' });

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

  // ตรวจสอบอัพเดทหลังเปิดแอป (รอ 3 วินาที)
  setTimeout(() => {
    if (mainWindow) checkUpdate();
  }, 3000);
}

// === Auto Update ===

function checkUpdate() {
  if (!updater) {
    updater = require('./updater');
  }
  updater.checkForUpdates(mainWindow);
}

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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
