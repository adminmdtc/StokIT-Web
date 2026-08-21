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
  },

  /* เชื่อมต่อ Firebase */
  async connect() {
    if (this.connected) return true;
    if (!this.config) {
      this.config = this.loadConfig();
    }
    if (!this.config || !this.config.apiKey) return false;

    try {
      // ใช้ Firebase SDK จาก CDN
      const firebaseConfig = {
        apiKey: this.config.apiKey,
        authDomain: this.config.authDomain,
        databaseURL: this.config.databaseURL,
        projectId: this.config.projectId,
      };

      // ตรวจสอบว่า Firebase SDK โหลดแล้วหรือยัง
      if (typeof firebase === 'undefined') {
        console.error('Firebase SDK not loaded');
        return false;
      }

      // Initialize Firebase (ถ้ายังไม่ได้ init)
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      
      this.db = firebase.database();
      this.connected = true;
      console.log('Firebase connected successfully');
      return true;
    } catch (e) {
      console.error('Firebase connect error:', e);
      this.connected = false;
      return false;
    }
  },

  /* ปิดการเชื่อมต่อ */
  disconnect() {
    if (this.db) {
      // ลบ listeners ทั้งหมด
      this._listeners.forEach(ref => ref.off());
      this._listeners = [];
    }
    this.connected = false;
    this.db = null;
  },

  /* ============================================================
     Sync Operations
     ============================================================ */

  /* ซิงค์ข้อมูลทั้งหมดจาก Firebase ลง local */
  async syncFromFirebase() {
    if (!this.connected || !this.db) return false;
    
    try {
      const snapshot = await this.db.ref('itstock').once('value');
      const data = snapshot.val();
      
      if (data) {
        // บันทึกลง localStorage
        localStorage.setItem(DB_KEY, JSON.stringify(data));
        // อัปเดต Store
        Store.db = data;
        console.log('Synced from Firebase:', Object.keys(data));
        return true;
      }
      return false;
    } catch (e) {
      console.error('Sync from Firebase error:', e);
      return false;
    }
  },

  /* ส่งข้อมูลทั้งหมดขึ้น Firebase */
  async syncToFirebase() {
    if (!this.connected || !this.db) return false;
    
    try {
      await this.db.ref('itstock').set(Store.db);
      console.log('Synced to Firebase');
      return true;
    } catch (e) {
      console.error('Sync to Firebase error:', e);
      return false;
    }
  },

  /* ฟังการเปลี่ยนแปลงแบบ real-time */
  onChanges(callback) {
    if (!this.connected || !this.db) return;
    
    const ref = this.db.ref('itstock');
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // เปรียบเทียบกับข้อมูลปัจจุบัน
        const currentStr = JSON.stringify(Store.db);
        const newStr = JSON.stringify(data);
        
        if (currentStr !== newStr) {
          // มีการเปลี่ยนแปลง
          localStorage.setItem(DB_KEY, newStr);
          Store.db = data;
          console.log('Firebase data changed, syncing...');
          if (callback) callback(data);
        }
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
    await FirebaseDB.syncToFirebase();
  }
}

/* ซิงค์ข้อมูลจาก Firebase (เรียกเมื่อเริ่มต้น) */
async function autoSyncFromFirebase() {
  if (isFirebaseEnabled()) {
    const success = await FirebaseDB.syncFromFirebase();
    if (success) {
      // รีเฟรช UI
      if (typeof route === 'function') route();
    }
    return success;
  }
  return false;
}
