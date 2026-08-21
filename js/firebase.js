'use strict';

/* ============================================================
   Firebase — เชื่อมต่อ Firebase Realtime Database
   สำหรับ sync ข้อมูลหลายเครื่อง
   ============================================================ */

const FirebaseDB = {
  app: null,
  db: null,
  connected: false,
  config: null,
  _listeners: [],
  _syncing: false,
  _periodicInterval: null,
  _statusCallbacks: [],

  /* โหลด config จาก localStorage */
  loadConfig() {
    try {
      const raw = localStorage.getItem('it_stock_firebase_config');
      if (raw) {
        this.config = JSON.parse(raw);
        return this.config;
      }
    } catch (e) { /* ignore */ }
    return null;
  },

  /* บันทึก config */
  saveConfig(config) {
    this.config = config;
    localStorage.setItem('it_stock_firebase_config', JSON.stringify(config));
  },

  /* ลบ config */
  clearConfig() {
    this.config = null;
    localStorage.removeItem('it_stock_firebase_config');
    this.stopPeriodicSync();
  },

  /* ลงทะเบียน callback สำหรับสถานะ */
  onStatusChange(callback) {
    this._statusCallbacks.push(callback);
  },

  /* แจ้งสถานะเปลี่ยนแปลง */
  _emitStatus(status, message) {
    this._statusCallbacks.forEach(cb => {
      try { cb(status, message); } catch (e) { console.error('Status callback error:', e); }
    });
  },

  /* เชื่อมต่อ Firebase */
  async connect() {
    if (this.connected) return true;
    if (!this.config) {
      this.config = this.loadConfig();
    }
    if (!this.config || !this.config.apiKey) {
      this._emitStatus('offline', 'ไม่ได้เชื่อมต่อ');
      return false;
    }

    this._emitStatus('connecting', 'กำลังเชื่อมต่อ...');

    try {
      const firebaseConfig = {
        apiKey: this.config.apiKey,
        authDomain: this.config.authDomain,
        databaseURL: this.config.databaseURL,
        projectId: this.config.projectId,
      };

      if (typeof firebase === 'undefined') {
        console.error('Firebase SDK not loaded');
        this._emitStatus('error', 'Firebase SDK ไม่พร้อมใช้งาน');
        return false;
      }

      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      
      this.db = firebase.database();
      this.connected = true;
      console.log('Firebase connected successfully');
      this._emitStatus('connected', 'เชื่อมต่อแล้ว');
      
      // เริ่ม periodic sync
      this.startPeriodicSync();
      
      return true;
    } catch (e) {
      console.error('Firebase connect error:', e);
      this.connected = false;
      this._emitStatus('error', 'เชื่อมต่อล้มเหลว');
      return false;
    }
  },

  /* ปิดการเชื่อมต่อ */
  disconnect() {
    this.stopPeriodicSync();
    if (this.db) {
      this._listeners.forEach(ref => ref.off());
      this._listeners = [];
    }
    this.connected = false;
    this.db = null;
    this._emitStatus('offline', 'ยกเลิกการเชื่อมต่อ');
  },

  /* ============================================================
     Sync Operations
     ============================================================ */

  /* ซิงค์ข้อมูลทั้งหมดจาก Firebase ลง local */
  async syncFromFirebase() {
    if (!this.connected || !this.db) return false;
    if (this._syncing) return false; // ป้องกัน sync ซ้ำ
    
    this._syncing = true;
    this._emitStatus('syncing', 'กำลังซิงค์ข้อมูล...');
    try {
      const snapshot = await this.db.ref('itstock').once('value');
      const data = snapshot.val();
      
      if (data && typeof data === 'object') {
        // Force update Store.db ทั้งหมด
        Store.db = data;
        localStorage.setItem(DB_KEY, JSON.stringify(data));
        console.log('Synced from Firebase:', Object.keys(data));
        this._emitStatus('connected', 'เชื่อมต่อแล้ว');
        return true;
      }
      this._emitStatus('connected', 'เชื่อมต่อแล้ว');
      return false;
    } catch (e) {
      console.error('Sync from Firebase error:', e);
      this._emitStatus('error', 'ซิงค์ล้มเหลว');
      return false;
    } finally {
      this._syncing = false;
    }
  },

  /* ส่งข้อมูลทั้งหมดขึ้น Firebase */
  async syncToFirebase() {
    if (!this.connected || !this.db) return false;
    if (this._syncing) return false;
    
    this._syncing = true;
    this._emitStatus('syncing', 'กำลังบันทึก...');
    try {
      await this.db.ref('itstock').set(Store.db);
      console.log('Synced to Firebase');
      this._emitStatus('connected', 'เชื่อมต่อแล้ว');
      return true;
    } catch (e) {
      console.error('Sync to Firebase error:', e);
      this._emitStatus('error', 'บันทึกล้มเหลว');
      return false;
    } finally {
      this._syncing = false;
    }
  },

  /* ฟังการเปลี่ยนแปลงแบบ real-time */
  onChanges(callback) {
    if (!this.connected || !this.db) return;
    
    // ลบ listener เดิมก่อน
    this._listeners.forEach(ref => ref.off());
    this._listeners = [];
    
    const ref = this.db.ref('itstock');
    ref.on('value', async (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        // Force update เสมอ — ไม่เปรียบเทียบ
        Store.db = data;
        localStorage.setItem(DB_KEY, JSON.stringify(data));
        console.log('Firebase real-time update received');
        
        // รีเฟรช UI
        if (callback) callback(data);
      }
    });
    
    this._listeners.push(ref);
  },

  /* หยุดฟังการเปลี่ยนแปลง */
  stopListening() {
    this._listeners.forEach(ref => ref.off());
    this._listeners = [];
  },

  /* ============================================================
     Periodic Sync — fallback ทุก 30 วินาที
     ============================================================ */
  
  startPeriodicSync() {
    this.stopPeriodicSync();
    this._periodicInterval = setInterval(async () => {
      if (this.connected && !this._syncing) {
        try {
          await this.syncFromFirebase();
        } catch (e) {
          console.error('Periodic sync error:', e);
        }
      }
    }, 30000); // ทุก 30 วินาที
  },

  stopPeriodicSync() {
    if (this._periodicInterval) {
      clearInterval(this._periodicInterval);
      this._periodicInterval = null;
    }
  },

  /* ============================================================
     Test Connection
     ============================================================ */

  async testConnection() {
    if (!this.connected || !this.db) return { success: false, error: 'Not connected' };
    
    try {
      await this.db.ref('.info/connected').once('value');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
};

/* ============================================================
   Helper Functions
   ============================================================ */

/* ตรวจสอบว่า Firebase พร้อมใช้งาน */
function isFirebaseEnabled() {
  return FirebaseDB.connected && FirebaseDB.config;
}

/* ซิงค์ข้อมูลอัตโนมัติ (เรียกหลังบันทึกข้อมูล) */
async function autoSyncToFirebase() {
  if (isFirebaseEnabled()) {
    try {
      await FirebaseDB.syncToFirebase();
    } catch (e) {
      console.error('Auto sync to Firebase failed:', e);
    }
  }
}

/* ซิงค์ข้อมูลจาก Firebase (เรียกเมื่อเริ่มต้น) */
async function autoSyncFromFirebase() {
  if (isFirebaseEnabled()) {
    const success = await FirebaseDB.syncFromFirebase();
    if (success && typeof route === 'function') {
      route();
    }
    return success;
  }
  return false;
}
