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
    console.error('Check for updates failed:', err);
    sendToWindow('update-status', {
      status: 'error',
      message: 'ไม่สามารถตรวจสอบได้: ' + (err.message || 'ไม่ทราบสาเหตุ'),
    });
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
  // แสดง error เฉพาะที่ไม่ใช่ ENOENT (ไฟล์ yml ไม่เจอ)
  if (err.message && err.message.includes('ENOENT')) {
    console.log('app-update.yml not found, auto-update will use fallback config');
    return;
  }
  sendToWindow('update-status', {
    status: 'error',
    message: 'เกิดข้อผิดพลาด: ' + (err.message || 'ไม่ทราบสาเหตุ'),
  });
});

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

module.exports = {
  checkForUpdates: checkForUpdates,
  autoUpdater: autoUpdater,
};
