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
  _justSynced: false,
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

  /* ซิงค์ข้อมูลทั้งหมดจาก Firebase ลง local (พร้อม conflict detection) */
  async syncFromFirebase() {
    if (!this.connected || !this.db) return false;
    if (this._syncing) return false; // ป้องกัน sync ซ้ำ
    
    this._syncing = true;
    this._emitStatus('syncing', 'กำลังซิงค์ข้อมูล...');
    try {
      const snapshot = await this.db.ref('itstock').once('value');
      const data = snapshot.val();
      
      if (data && typeof data === 'object') {
        // ตรวจจับ conflict
        const conflictResult = ConflictResolver.detectConflicts(data);
        
        if (conflictResult && conflictResult.hasConflict) {
          // มี conflict → แสดง modal resolution
          console.log('Conflicts detected:', conflictResult.conflicts.length);
          this._emitStatus('connected', 'ตรวจพบข้อมูลขัดแย้ง');
          
          // บันทึก remote data เพื่อใช้ใน resolution
          window.__currentConflictResult = conflictResult;
          
          // แสดง modal (ต้องรอให้ UI พร้อม)
          setTimeout(() => {
            const html = ConflictResolver.renderConflictModal(conflictResult);
            if (html) openModal(`<div class="modal-head"><h3>แก้ไขข้อมูลขัดแย้ง</h3></div><div class="modal-body">${html}</div>`, { wide: true, noDismiss: true });
          }, 100);
          
          return false; // ไม่ sync อัตโนมัติ รอผู้ใช้แก้ conflict
        }
        
        if (conflictResult && conflictResult.autoMergeable.length > 0) {
          // ไม่มี conflict แต่มีข้อมูลต่างกัน → auto merge
          console.log('Auto-merging', conflictResult.autoMergeable.length, 'changes');
          ConflictResolver.autoMerge(conflictResult);
        }
        
        // ไม่มี conflict → force update แต่เก็บข้อมูลท้องถิ่นที่ยังไม่ได้ sync
        const localOnlyData = this._getLocalOnlyData(data);
        Store.db = data;
        // เพิ่มข้อมูลท้องถิ่นกลับเข้าไป
        if (localOnlyData.items.length > 0 || localOnlyData.transactions.length > 0 || localOnlyData.users.length > 0) {
          if (!Store.db.items) Store.db.items = [];
          if (!Store.db.transactions) Store.db.transactions = [];
          if (!Store.db.users) Store.db.users = [];
          
          localOnlyData.items.forEach(item => {
            if (!Store.db.items.find(x => x.id === item.id)) {
              Store.db.items.push(item);
              console.log('Preserved local-only item:', item.name);
            }
          });
          
          localOnlyData.transactions.forEach(tx => {
            if (!Store.db.transactions.find(x => x.id === tx.id)) {
              Store.db.transactions.push(tx);
              console.log('Preserved local-only transaction:', tx.no);
            }
          });
          
          localOnlyData.users.forEach(u => {
            if (!Store.db.users.find(x => x.id === u.id)) {
              Store.db.users.push(u);
              console.log('Preserved local-only user:', u.username);
            }
          });
        }
        localStorage.setItem(DB_KEY, JSON.stringify(Store.db));
        Store._saveSyncBase();
        console.log('Synced from Firebase:', Object.keys(Store.db));
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

  /* ค้นหาข้อมูลที่มีเฉพาะในเครื่องนี้ (ยังไม่ได้ sync ขึ้น Firebase) */
  _getLocalOnlyData(remoteData) {
    const localItems = Store.db.items || [];
    const localTransactions = Store.db.transactions || [];
    const localUsers = Store.db.users || [];
    
    const remoteItems = (remoteData && remoteData.items) || [];
    const remoteTransactions = (remoteData && remoteData.transactions) || [];
    const remoteUsers = (remoteData && remoteData.users) || [];
    
    const remoteItemIds = new Set(remoteItems.map(i => i.id));
    const remoteTxIds = new Set(remoteTransactions.map(t => t.id));
    const remoteUserIds = new Set(remoteUsers.map(u => u.id));
    
    // คืนค่า users ที่มีเฉพาะใน local
    return localUsers.filter(u => !remoteUserIds.has(u.id));
  },

  /* ส่งข้อมูลทั้งหมดขึ้น Firebase */
  async syncToFirebase() {
    if (!this.connected || !this.db) return false;
    if (this._syncing) return false;
    
    this._syncing = true;
    this._justSynced = true;
    this._emitStatus('syncing', 'กำลังบันทึก...');
    try {
      await this.db.ref('itstock').set(Store.db);
      Store._saveSyncBase();
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

  /* ฟังการเปลี่ยนแปลงแบบ real-time (พร้อม conflict detection) */
  onChanges(callback) {
    if (!this.connected || !this.db) return;
    
    // ลบ listener เดิมก่อน
    this._listeners.forEach(ref => ref.off());
    this._listeners = [];
    
    const ref = this.db.ref('itstock');
    ref.on('value', async (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        // ถ้าเพิ่ง syncToFirebase ให้ข้าม conflict detection (เป็น echo ของตัวเอง)
        if (this._justSynced) {
          this._justSynced = false;
          Store.db = data;
          localStorage.setItem(DB_KEY, JSON.stringify(data));
          Store._saveSyncBase();
          console.log('Firebase echo after syncTo — skip conflict detection');
          if (callback) callback(data);
          return;
        }
        
        // ตรวจจับ conflict ก่อน force update
        const conflictResult = ConflictResolver.detectConflicts(data);
        
        if (conflictResult && conflictResult.hasConflict) {
          console.log('Real-time conflict detected:', conflictResult.conflicts.length);
          this._emitStatus('connected', 'ตรวจพบข้อมูลขัดแย้ง');
          window.__currentConflictResult = conflictResult;
          setTimeout(() => {
            const html = ConflictResolver.renderConflictModal(conflictResult);
            if (html) openModal(`<div class="modal-head"><h3>แก้ไขข้อมูลขัดแย้ง</h3></div><div class="modal-body">${html}</div>`, { wide: true, noDismiss: true });
          }, 100);
          return; // ไม่ sync อัตโนมัติ
        }
        
        if (conflictResult && conflictResult.autoMergeable.length > 0) {
          console.log('Real-time auto-merge:', conflictResult.autoMergeable.length, 'changes');
          ConflictResolver.autoMerge(conflictResult);
        }
        
        // Force update
        Store.db = data;
        localStorage.setItem(DB_KEY, JSON.stringify(data));
        Store._saveSyncBase();
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
      const result = await FirebaseDB.syncToFirebase();
      return result;
    } catch (e) {
      console.error('Auto sync to Firebase failed:', e);
      return false;
    }
  }
  console.log('Firebase not enabled - skipping sync');
  return false;
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
