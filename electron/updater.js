'use strict';

const { autoUpdater } = require('electron-updater');
const { BrowserWindow, dialog, ipcMain } = require('electron');
const log = require('electron-log');

// ตั้งค่า logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// ปิด auto-download (ให้ผู้ใช้ยืนยันก่อน)
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let updateWindow = null;
let isChecking = false;

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
  updateWindow.loadFile(require('path').join(__dirname, 'update.html'));
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
    log.error('Check for updates failed:', err);
    sendToWindow('update-status', {
      status: 'error',
      message: 'ไม่สามารถตรวจสอบได้: ' + (err.message || 'ไม่ทราบสาเหตุ'),
    });
  });
}

// === Event Handlers ===

autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
  sendToWindow('update-status', { status: 'checking', message: 'กำลังตรวจสอบอัพเดท...' });
});

autoUpdater.on('update-available', (info) => {
  isChecking = false;
  log.info('Update available:', info.version);
  sendToWindow('update-status', {
    status: 'available',
    message: `พบเวอร์ชันใหม่ ${info.version}`,
    currentVersion: require('./package.json').version,
    newVersion: info.version,
    releaseNotes: info.releaseNotes || null,
  });
});

autoUpdater.on('update-not-available', (info) => {
  isChecking = false;
  log.info('Update not available. Current:', info.version);
  sendToWindow('update-status', {
    status: 'up-to-date',
    message: `เป็นเวอร์ชันล่าสุดแล้ว (${info.version})`,
  });
  // ปิดหน้าต่างอัตโนมัติหลัง 2 วินาที
  setTimeout(closeUpdateWindow, 2000);
});

autoUpdater.on('download-progress', (progress) => {
  const msg = `กำลังดาวน์โหลด... ${Math.round(progress.percent)}%`;
  log.info(msg);
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
  log.info('Update downloaded:', info.version);
  sendToWindow('update-status', {
    status: 'downloaded',
    message: `ดาวน์โหลดเสร็จแล้ว! ต้องการรีสตาร์ทเพื่ออัพเดท`,
  });

  // ถามผู้ใช้ว่าต้องการรีสตาร์ทเลยหรือไม่
  const parentWin = updateWindow || BrowserWindow.getFocusedWindow();
  dialog.showMessageBox(parentWin, {
    type: 'info',
    title: 'มีเวอร์ชันใหม่พร้อมติดตั้ง',
    message: `IT Stock เวอร์ชัน ${info.version} พร้อมแล้ว`,
    detail: 'ต้องการรีสตาร์ทโปรแกรมเพื่ออัพเดทตอนนี้เลยไหม?',
    buttons: ['รีสตาร์ทตอนนี้', 'ภายหลัง'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
});

autoUpdater.on('error', (err) => {
  isChecking = false;
  log.error('Auto-updater error:', err);
  sendToWindow('update-status', {
    status: 'error',
    message: 'เกิดข้อผิดพลาด: ' + (err.message || 'ไม่ทราบสาเหตุ'),
  });
});

// === IPC Handlers ===

ipcMain.on('start-download', () => {
  log.info('User approved download');
  autoUpdater.downloadUpdate();
});

ipcMain.on('restart-app', () => {
  log.info('User approved restart');
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.on('close-update-window', () => {
  closeUpdateWindow();
});

module.exports = {
  checkForUpdates,
  autoUpdater,
};
