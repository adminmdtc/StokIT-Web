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
   Firebase Initialization
   ============================================================ */
async function initFirebase() {
  // โหลด config
  const config = FirebaseDB.loadConfig();
  if (config && config.apiKey) {
    // เชื่อมต่อ Firebase
    const connected = await FirebaseDB.connect();
    if (connected) {
      console.log('Firebase connected on startup');
      
      // ซิงค์ข้อมูลจาก Firebase (force update)
      const synced = await FirebaseDB.syncFromFirebase();
      if (synced) {
        console.log('Initial sync from Firebase completed');
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
});
