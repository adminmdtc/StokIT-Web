'use strict';

/* ============================================================
   App — entry point, router, event binding
   ============================================================ */

function route() {
  const user = Auth.current();
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');

  if (!user) {
    loginView.classList.remove('hidden');
    appView.classList.add('hidden');
    closeModal();
    return;
  }

  loginView.classList.add('hidden');
  appView.classList.remove('hidden');

  const fullHash = (location.hash || '#/dashboard').replace(/^#\//, '');
  let path = fullHash.split('?')[0];
  const queryString = fullHash.includes('?') ? fullHash.split('?')[1] : '';
  const queryParams = Object.fromEntries(new URLSearchParams(queryString));
  if (!Views[path]) path = 'dashboard';
  if (path === 'users' && user.role !== 'admin') path = 'dashboard';

  const view = Views[path];
  document.getElementById('page-title').textContent = view.title;
  document.getElementById('page-sub').textContent = view.sub;
  document.getElementById('today-chip').textContent = todayLabel();

  /* ด้านข้าง */
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === path));
  document.getElementById('nav-users').classList.toggle('hidden', user.role !== 'admin');

  /* ป้ายแจ้งเตือนวัสดุใกล้หมดที่เมนูคงเหลือ */
  const lowCount = Store.getStock().filter(s => s.status !== 'ok').length;
  const badge = document.getElementById('nav-stock-badge');
  if (badge) {
    badge.textContent = lowCount;
    badge.classList.toggle('hidden', lowCount === 0);
    badge.title = lowCount ? `วัสดุใกล้หมด / หมดคลัง ${lowCount} รายการ` : '';
  }

  /* ข้อมูลผู้ใช้ */
  document.getElementById('sb-name').textContent = user.name;
  document.getElementById('sb-role').textContent = user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่';
  document.getElementById('sb-avatar').textContent = (user.name || '?')[0];

  /* เรนเดอร์เนื้อหา */
  const content = document.getElementById('content');
  content.innerHTML = view.render();
  if (view.init) view.init(queryParams);
}

/* ---------- นำทาง (เรียกจาก views) ---------- */
App.go = function (hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
};

/* ---------- ตัวจัดการเหตุการณ์ ---------- */
function bindLogin() {
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    const user = Auth.login(u, p);
    const err = document.getElementById('login-error');
    if (user) {
      err.classList.add('hidden');
      document.getElementById('login-password').value = '';
      location.hash = '#/dashboard';
      toast(`ยินดีต้อนรับ คุณ${user.name}`);
      route();
      const low = Store.getStock().filter(s => s.status !== 'ok').length;
      if (low > 0) setTimeout(() => toast(`มีวัสดุใกล้หมด / หมดคลัง ${low} รายการ — ดูที่หน้าคงเหลือ`, 'error'), 400);
    } else {
      err.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      err.classList.remove('hidden');
    }
  });
}

function bindSidebar() {
  document.getElementById('btn-logout').addEventListener('click', () => {
    Auth.logout();
    toast('ออกจากระบบแล้ว', 'info');
    location.hash = '';
    route();
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    confirmAction('รีเซ็ตข้อมูลตัวอย่าง',
      'จะล้างข้อมูลทั้งหมดและกลับไปเป็นข้อมูลตัวอย่างเริ่มต้น ต้องการดำเนินการต่อหรือไม่?',
      () => { Store.reset(); location.reload(); }, 'รีเซ็ต');
  });
  /* เปลี่ยนรหัสผ่านจากบัตรผู้ใช้ */
  document.querySelector('.user-card').addEventListener('click', () => App.openChangePw());
}

/* ============================================================
   Sync Sound — Web Audio API
   ============================================================ */
let _audioCtx = null;
let _syncSoundReady = false;
let _syncSoundEnabled = localStorage.getItem('it_stock_sync_sound') !== 'off';
let _syncNotifyEnabled = localStorage.getItem('it_stock_sync_notify') !== 'off';

App.toggleSyncSound = function(enabled) {
  _syncSoundEnabled = enabled;
  localStorage.setItem('it_stock_sync_sound', enabled ? 'on' : 'off');
  if (enabled) playSyncSuccess();
};

App.toggleSyncNotify = function(enabled) {
  _syncNotifyEnabled = enabled;
  localStorage.setItem('it_stock_sync_notify', enabled ? 'on' : 'off');
  if (enabled) requestNotificationPermission();
};

/* ============================================================
   Browser Notifications
   ============================================================ */
function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

function showSyncNotification(title, body, type) {
  if (!_syncNotifyEnabled || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const icon = type === 'error'
      ? 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">❌</text></svg>'
      : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✅</text></svg>';

    const n = new Notification(title, { body, icon, tag: 'it-stock-sync' });
    setTimeout(() => n.close(), 4000);
  } catch (e) { /* ignore */ }
}

function getAudioContext() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

/* เล่นโน้ตเดียว */
function playNote(freq, duration, delay, volume) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration);
  } catch (e) { /* ignore */ }
}

/* เสียงสำเร็จ — 2 โน้ตสูง ascending */
function playSyncSuccess() {
  playNote(523, 0.12, 0, 0.12);    // C5
  playNote(659, 0.15, 0.1, 0.12);  // E5
}

/* เสียงล้มเหลว — 2 โน้ตต่ำ descending */
function playSyncError() {
  playNote(330, 0.15, 0, 0.1);     // E4
  playNote(220, 0.2, 0.12, 0.1);   // A3
}

/* เสียงกำลัง sync — คลิกเบาๆ */
function playSyncing() {
  playNote(880, 0.06, 0, 0.06);    // A5 เบาๆ
}

/* เสียงออฟไลน์ — 3 โน้ต descending เบาๆ */
function playOffline() {
  playNote(440, 0.1, 0, 0.08);     // A4
  playNote(349, 0.1, 0.08, 0.08);  // F4
  playNote(262, 0.15, 0.16, 0.08); // C4
}

/* ============================================================
   Sync Indicator
   ============================================================ */
let _prevSyncStatus = '';

function updateSyncIndicator(status, message) {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  if (!dot || !text) return;

  dot.className = 'sync-dot';

  // เล่นเสียง + notification (เฉพาะเมื่อสถานะเปลี่ยน และไม่ใช่ครั้งแรก)
  if (_syncSoundReady && status !== _prevSyncStatus) {
    if (_syncSoundEnabled) {
      switch (status) {
        case 'connected':  playSyncSuccess(); break;
        case 'error':      playSyncError(); break;
        case 'syncing':    playSyncing(); break;
        case 'offline':    playOffline(); break;
      }
    }
    if (status === 'connected') {
      showSyncNotification('✅ IT Stock', 'เชื่อมต่อ Firebase สำเร็จ — ข้อมูลซิงค์แล้ว', 'success');
    } else if (status === 'error') {
      showSyncNotification('❌ IT Stock', 'เชื่อมต่อ Firebase ล้มเหลว — ลองใหม่อีกครั้ง', 'error');
    }
  }
  _prevSyncStatus = status;

  switch (status) {
    case 'connected':
      dot.classList.add('connected');
      text.textContent = message || 'เชื่อมต่อแล้ว';
      break;
    case 'connecting':
      dot.classList.add('syncing');
      text.textContent = message || 'กำลังเชื่อมต่อ...';
      break;
    case 'syncing':
      dot.classList.add('syncing');
      text.textContent = message || 'กำลังซิงค์...';
      break;
    case 'error':
      dot.classList.add('error');
      text.textContent = message || 'เกิดข้อผิดพลาด';
      break;
    case 'offline':
    default:
      dot.classList.add('offline');
      text.textContent = message || 'ไม่ได้เชื่อมต่อ';
      break;
  }
}

/* ============================================================
   Firebase Initialization
   ============================================================ */
async function initFirebase() {
  // ลงทะเบียน sync indicator
  FirebaseDB.onStatusChange(updateSyncIndicator);

  // แสดงสถานะเริ่มต้น
  updateSyncIndicator('offline', 'ไม่ได้เชื่อมต่อ');

  // โหลด config
  const config = FirebaseDB.loadConfig();
  if (config && config.apiKey) {
    // เชื่อมต่อ Firebase
    const connected = await FirebaseDB.connect();
    if (connected) {
      console.log('Firebase connected on startup');
      
      // ซิงค์ข้อมูลจาก Firebase (พร้อม conflict detection)
      const synced = await FirebaseDB.syncFromFirebase();
      if (synced) {
        console.log('Initial sync from Firebase completed');
        Store._saveSyncBase();
        route(); // รีเฟรช UI
      }
      
      // ฟังการเปลี่ยนแปลงแบบ real-time
      FirebaseDB.onChanges((data) => {
        console.log('Firebase real-time update received, refreshing UI...');
        // รีเฟรชหน้าปัจจุบัน
        route();
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  Store.load();
  bindLogin();
  bindSidebar();
  window.addEventListener('hashchange', route);
  route();
  
  // เริ่มต้น Firebase
  await initFirebase();

  // เปิดใช้งานเสียงหลัง init เสร็จ (ป้องกันเสียงครั้งแรก)
  setTimeout(() => { _syncSoundReady = true; }, 2000);

  // ขอ permission สำหรับ browser notification
  if (_syncNotifyEnabled) requestNotificationPermission();
});
