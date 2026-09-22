'use strict';

const { autoUpdater } = require('electron-updater');
const { BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let updateWindow = null;
let isChecking = false;

// ตรวจสอบ app-update.yml
const ymlPath = path.join(process.resourcesPath || __dirname, 'app-update.yml');
if (!fs.existsSync(ymlPath)) {
  // ถ้าไม่มีไฟล์ yml ให้ copy จาก directory ของ app
  const srcPath = path.join(__dirname, 'app-update.yml');
  if (fs.existsSync(srcPath)) {
    try {
      fs.copyFileSync(srcPath, ymlPath);
    } catch (e) {
      // ถ้า copy ไม่ได้ ให้ตั้งค่า provider โดยตรง
    }
  }
}

// ตั้งค่า logger
try {
  const log = require('electron-log');
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';
} catch (e) {
  // electron-log ไม่พร้อมใช้งาน
}

// ตั้งค่า auto-update
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// ตั้งค่า feed URL โดยตรง (fallback ถ้าไม่มี yml)
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'adminmdtc',
  repo: 'StokIT-Web',
  releaseType: 'release',
});

/**
 * สร้างหน้าต่างแสดงสถานะอัพเดท
 */
function createUpdateWindow(mainWin) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }

  updateWindow = new BrowserWindow({
    width: 420,
    height: 320,
    parent: mainWin || undefined,
    modal: !!mainWin,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#1e293b',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  updateWindow.setMenuBarVisibility(false);
  updateWindow.loadFile(path.join(__dirname, 'update.html'));
  updateWindow.on('closed', () => { updateWindow = null; });
}

/**
 * ส่งข้อความไปยังหน้าต่างอัพเดท
 */
function sendToWindow(channel, data) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send(channel, data);
  }
}

/**
 * ปิดหน้าต่างอัพเดท
 */
function closeUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
}

/**
 * เริ่มตรวจสอบอัพเดท
 */
function checkForUpdates(mainWin) {
  if (isChecking) return;
  isChecking = true;

  createUpdateWindow(mainWin);
  sendToWindow('update-status', { status: 'checking', message: 'กำลังตรวจสอบอัพเดท...' });

  autoUpdater.checkForUpdates().catch((err) => {
    isChecking = false;
    console.log('Check for updates failed (this is normal if offline):', err.message || err);
    // Close silently — don't bother the user with update errors
    closeUpdateWindow();
  });
}

// === Event Handlers ===

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
  sendToWindow('update-status', { status: 'checking', message: 'กำลังตรวจสอบอัพเดท...' });
});

autoUpdater.on('update-available', (info) => {
  isChecking = false;
  console.log('Update available:', info.version);
  sendToWindow('update-status', {
    status: 'available',
    message: 'พบเวอร์ชันใหม่ ' + info.version,
    currentVersion: require('./package.json').version,
    newVersion: info.version,
    releaseNotes: info.releaseNotes || null,
  });
});

autoUpdater.on('update-not-available', (info) => {
  isChecking = false;
  console.log('Update not available. Current:', info.version);
  sendToWindow('update-status', {
    status: 'up-to-date',
    message: 'เป็นเวอร์ชันล่าสุดแล้ว (' + info.version + ')',
  });
  setTimeout(closeUpdateWindow, 2000);
});

autoUpdater.on('download-progress', (progress) => {
  var msg = 'กำลังดาวน์โหลด... ' + Math.round(progress.percent) + '%';
  console.log(msg);
  sendToWindow('update-status', {
    status: 'downloading',
    message: msg,
    percent: progress.percent,
    transferred: progress.transferred,
    total: progress.total,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  isChecking = false;
  console.log('Update downloaded:', info.version);
  sendToWindow('update-status', {
    status: 'downloaded',
    message: 'ดาวน์โหลดเสร็จแล้ว! ต้องการรีสตาร์ทเพื่ออัพเดท',
  });

  var parentWin = updateWindow || BrowserWindow.getFocusedWindow();
  dialog.showMessageBox(parentWin, {
    type: 'info',
    title: 'มีเวอร์ชันใหม่พร้อมติดตั้ง',
    message: 'IT Stock เวอร์ชัน ' + info.version + ' พร้อมแล้ว',
    detail: 'ต้องการรีสตาร์ทโปรแกรมเพื่ออัพเดทตอนนี้เลยไหม?',
    buttons: ['รีสตาร์ทตอนนี้', 'ภายหลัง'],
    defaultId: 0,
    cancelId: 1,
  }).then(function(result) {
    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
});

autoUpdater.on('error', (err) => {
  isChecking = false;
  console.error('Auto-updater error:', err);
  // ปิด error ทั้งหมด — ไม่แสดงหน้าต่าง error ให้ user
  // เพราะ auto-update เป็น optional feature
  closeUpdateWindow();
});

/**
 * ส่งสถานะอัพเดทไปยังหน้าต่างหลักด้วย (สำหรับปุ่ม "อัปเดตโปรแกรม" บนแถบด้านบน)
 */
function sendToMainWindow(channel, data) {
  try {
    const { BrowserWindow: BW } = require('electron');
    const wins = BW.getAllWindows();
    wins.forEach(w => { if (!w.isDestroyed() && w.webContents) w.webContents.send(channel, data); });
  } catch (e) { /* ไม่มีหน้าต่าง */ }
}

// === IPC Handlers ===

ipcMain.on('start-download', () => {
  console.log('User approved download');
  autoUpdater.downloadUpdate();
});

ipcMain.on('restart-app', () => {
  console.log('User approved restart');
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.on('close-update-window', () => {
  closeUpdateWindow();
});

// === IPC Handlers สำหรับปุ่มในหน้าแอป (invoke-based) ===
const { ipcMain: _ipc } = require('electron');

_ipc.handle('updater:version', () => {
  try { return require('./package.json').version; } catch (e) { return ''; }
});

_ipc.handle('updater:check', async () => {
  try {
    isChecking = true;
    const res = await autoUpdater.checkForUpdates();
    isChecking = false;
    const info = res && res.updateInfo ? res.updateInfo : null;
    const cur = (function(){ try { return require('./package.json').version; } catch (e) { return ''; } })();
    if (info && info.version && info.version !== cur) {
      return { status: 'available', currentVersion: cur, newVersion: info.version, releaseNotes: info.releaseNotes || null };
    }
    return { status: 'up-to-date', currentVersion: cur };
  } catch (err) {
    isChecking = false;
    return { status: 'error', message: (err && err.message) || String(err) };
  }
});

_ipc.handle('updater:download', async () => {
  try { await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (err) { return { ok: false, message: (err && err.message) || String(err) }; }
});

_ipc.handle('updater:install', () => {
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

// ส่งต่อทุกอีเวนต์ของ autoUpdater ไปยังหน้าหลักด้วย (ให้ปุ่มแสดง % ได้)
autoUpdater.on('checking-for-update', () => sendToMainWindow('update-status', { status: 'checking', message: 'กำลังตรวจสอบอัพเดท...' }));
autoUpdater.on('update-available', (info) => sendToMainWindow('update-status', {
  status: 'available',
  message: 'พบเวอร์ชันใหม่ ' + info.version,
  currentVersion: (function(){ try { return require('./package.json').version; } catch (e) { return ''; } })(),
  newVersion: info.version,
}));
autoUpdater.on('update-not-available', (info) => sendToMainWindow('update-status', { status: 'up-to-date', message: 'เป็นเวอร์ชันล่าสุดแล้ว', currentVersion: info.version }));
autoUpdater.on('download-progress', (progress) => sendToMainWindow('update-status', {
  status: 'downloading',
  message: 'กำลังดาวน์โหลด... ' + Math.round(progress.percent) + '%',
  percent: progress.percent,
}));
autoUpdater.on('update-downloaded', (info) => sendToMainWindow('update-status', { status: 'downloaded', message: 'ดาวน์โหลดเสร็จแล้ว', newVersion: info.version }));
autoUpdater.on('error', (err) => sendToMainWindow('update-status', { status: 'error', message: (err && err.message) || String(err) }));

module.exports = {
  checkForUpdates: checkForUpdates,
  autoUpdater: autoUpdater,
};
