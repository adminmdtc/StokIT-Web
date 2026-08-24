'use strict';

/* ============================================================
   Firebase — เชื่อมต่อ Firebase Realtime Database
   สำหรับ sync ข้อมูลหลายเครื่อง
   พร้อมระบบ auto-reconnect สำหรับ iOS Safari
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
  _reconnectTimer: null,
  _reconnectAttempts: 0,
  _maxReconnectAttempts: 10,
  _baseReconnectDelay: 1000,
  _connectionMonitorRef: null,
  _visibilityChangeHandler: null,
  _onlineHandler: null,
  _offlineHandler: null,
  _syncIntervalSeconds: 10,

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
      
      // เริ่ม monitor connection state
      this._startConnectionMonitor();
      
      return true;
    } catch (e) {
      console.error('Firebase connect error:', e);
      this.connected = false;
      this._emitStatus('error', 'เชื่อมต่อล้มเหลว');
      return false;
    }
  },

  /* ============================================================
     Connection Monitor — ตรวจสอบ .info/connected จริงๆ
     ============================================================ */

  _startConnectionMonitor() {
    // ลบ monitor เดิมก่อน
    this._stopConnectionMonitor();
    
    if (!this.db) return;
    
    // ฟัง .info/connected ของ Firebase (ค่าจริง ไม่ใช่แค่ flag)
    const connectedRef = this.db.ref('.info/connected');
    this._connectionMonitorRef = connectedRef;
    
    connectedRef.on('value', (snap) => {
      const firebaseConnected = snap.val();
      console.log('Firebase .info/connected:', firebaseConnected);
      
      if (firebaseConnected) {
        // เชื่อมต่อสำเร็จ — รีเซ็ต reconnect attempts
        this._reconnectAttempts = 0;
        this.connected = true;
        this._emitStatus('connected', 'เชื่อมต่อแล้ว');
        
        // ตั้งค่า onDisconnect handlers
        this._setupDisconnectHandlers();
      } else {
        // Firebase ตัดการเชื่อมต่อ
        console.warn('Firebase connection lost — triggering reconnect');
        this.connected = false;
        this._emitStatus('offline', 'การเชื่อมต่อขาด — กำลังเชื่อมต่อใหม่...');
        
        // เริ่ม reconnect
        this._scheduleReconnect();
      }
    });
    
    // ตรวจสอบ visibility change (iOS Safari background)
    this._visibilityChangeHandler = () => {
      if (document.visibilityState === 'visible') {
        console.log('Page became visible — checking Firebase connection');
        // เมื่อกลับมาหน้าจอ ตรวจสอบ connection ใหม่
        this._checkAndReconnect();
      }
    };
    document.addEventListener('visibilitychange', this._visibilityChangeHandler);
    
    // ตรวจสอบ online/offline events
    this._onlineHandler = () => {
      console.log('Network online — reconnecting Firebase');
      setTimeout(() => this._checkAndReconnect(), 1000);
    };
    this._offlineHandler = () => {
      console.log('Network offline');
      this._emitStatus('offline', 'ออฟไลน์');
    };
    window.addEventListener('online', this._onlineHandler);
    window.addEventListener('offline', this._offlineHandler);
  },

  _stopConnectionMonitor() {
    if (this._connectionMonitorRef) {
      this._connectionMonitorRef.off();
      this._connectionMonitorRef = null;
    }
    if (this._visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
      this._visibilityChangeHandler = null;
    }
    if (this._onlineHandler) {
      window.removeEventListener('online', this._onlineHandler);
      this._onlineHandler = null;
    }
    if (this._offlineHandler) {
      window.removeEventListener('offline', this._offlineHandler);
      this._offlineHandler = null;
    }
  },

  /* ตั้งค่า onDisconnect handlers */
  _setupDisconnectHandlers() {
    if (!this.db) return;
    
    // สร้าง presence node เพื่อตรวจสอบ connection
    const presenceRef = this.db.ref('.info/presence/' + this._getClientId());
    presenceRef.onDisconnect().remove();
    presenceRef.set(true);
  },

  /* สร้าง client ID ไม่ซ้ำ */
  _getClientId() {
    if (!this._clientId) {
      this._clientId = 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
    return this._clientId;
  },

  /* ตรวจสอบและ reconnect ถ้าจำเป็น */
  async _checkAndReconnect() {
    if (!this.db) return;
    
    try {
      const snap = await this.db.ref('.info/connected').once('value');
      if (!snap.val()) {
        console.log('Firebase not connected — triggering reconnect');
        this.connected = false;
        this._emitStatus('offline', 'กำลังเชื่อมต่อใหม่...');
        this._scheduleReconnect();
      }
    } catch (e) {
      console.error('Connection check error:', e);
      this._scheduleReconnect();
    }
  },

  /* ตั้งเวลา reconnect พร้อม exponential backoff */
  _scheduleReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }
    
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      this._emitStatus('error', 'เชื่อมต่อล้มเหลว — กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
      return;
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s, ... (max 30s)
    const delay = Math.min(
      this._baseReconnectDelay * Math.pow(2, this._reconnectAttempts),
      30000
    );
    
    // เพิ่ม jitter เพื่อป้องกัน thundering herd
    const jitter = Math.random() * 1000;
    const totalDelay = delay + jitter;
    
    console.log(`Reconnect scheduled in ${Math.round(totalDelay)}ms (attempt ${this._reconnectAttempts + 1}/${this._maxReconnectAttempts})`);
    
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectAttempts++;
      
      try {
        // ลอง force reconnect
        await this._forceReconnect();
      } catch (e) {
        console.error('Reconnect attempt failed:', e);
        this._scheduleReconnect();
      }
    }, totalDelay);
  },

  /* Force reconnect Firebase */
  async _forceReconnect() {
    if (!this.config) return;
    
    console.log('Force reconnecting Firebase...');
    this._emitStatus('connecting', 'กำลังเชื่อมต่อใหม่...');
    
    try {
      // ปิด listener เดิม
      this._stopConnectionMonitor();
      
      // Disconnect Firebase instance เดิม
      if (this.db) {
        this.db.goOffline();
        this.db.goOnline();
      }
      
      // ตรวจสอบ connection ใหม่
      const snap = await this.db.ref('.info/connected').once('value');
      const connected = snap.val();
      
      if (connected) {
        console.log('Firebase reconnected successfully');
        this.connected = true;
        this._reconnectAttempts = 0;
        this._emitStatus('connected', 'เชื่อมต่อใหม่สำเร็จ');
        
        // เริ่ม monitor ใหม่
        this._startConnectionMonitor();
        
        // Sync ข้อมูลใหม่
        await this.syncFromFirebase();
      } else {
        console.log('Firebase still not connected after goOnline');
        this.connected = false;
        this._emitStatus('offline', 'กำลังเชื่อมต่อใหม่...');
        
        // เริ่ม monitor ใหม่
        this._startConnectionMonitor();
        
        // ลอง reconnect อีกครั้ง
        this._scheduleReconnect();
      }
    } catch (e) {
      console.error('Force reconnect error:', e);
      this.connected = false;
      this._emitStatus('error', 'เชื่อมต่อล้มเหลว');
      
      // ลอง reconnect อีกครั้ง
      this._scheduleReconnect();
    }
  },

  /* ปิดการเชื่อมต่อ */
  disconnect() {
    this.stopPeriodicSync();
    this._stopConnectionMonitor();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._reconnectAttempts = 0;
    if (this.db) {
      this._listeners.forEach(ref => ref.off());
      this._listeners = [];
      this.db.goOffline();
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
        
        // กรณี remote ใหม่กว่า หรือ local ไม่เปลี่ยน → ใช้ remote
        if (conflictResult && conflictResult.useRemote) {
          console.log('Remote data is newer, using remote data');
          Store.db = data;
          localStorage.setItem(DB_KEY, JSON.stringify(data));
          Store._saveSyncBase();
          this._emitStatus('connected', 'เชื่อมต่อแล้ว');
          return true;
        }
        
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
        
        if (conflictResult && conflictResult.autoMergeable && conflictResult.autoMergeable.length > 0) {
          // ไม่มี conflict แต่มีข้อมูลต่างกัน → auto merge
          console.log('Auto-merging', conflictResult.autoMergeable.length, 'changes');
          ConflictResolver.autoMerge(conflictResult);
        }
        
        // ไม่มี conflict → force update ตามเดิม
        Store.db = data;
        localStorage.setItem(DB_KEY, JSON.stringify(data));
        Store._saveSyncBase();
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
    this._justSynced = true;
    this._justSyncedTime = Date.now();
    this._emitStatus('syncing', 'กำลังบันทึก...');
    try {
      // ใช้ transaction เพื่อป้องกัน conflict
      const ref = this.db.ref('itstock');
      await ref.transaction((currentData) => {
        // ใช้ข้อมูลใหม่สุด (timestamp เทียบ)
        const localTimestamp = Store.db._lastSync || 0;
        const remoteTimestamp = (currentData && currentData._lastSync) || 0;
        
        if (localTimestamp >= remoteTimestamp) {
          // ข้อมูล local ใหม่กว่า → ส่งขึ้น
          return Store.db;
        } else {
          // ข้อมูล remote ใหม่กว่า → ใช้ remote
          return currentData;
        }
      });
      
      Store._saveSyncBase();
      console.log('Synced to Firebase successfully');
      this._emitStatus('connected', 'เชื่อมต่อแล้ว');
      return true;
    } catch (e) {
      console.error('Sync to Firebase error:', e);
      this._emitStatus('error', 'บันทึกล้มเหลว');
      this._justSynced = false;
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
          // เปรียบเทียบ timestamp เพื่อให้แน่ใจว่าเป็น echo
          const timeDiff = Date.now() - (this._justSyncedTime || 0);
          if (timeDiff < 5000) {
            // ยังอยู่ในช่วง echo → skip conflict detection
            Store.db = data;
            localStorage.setItem(DB_KEY, JSON.stringify(data));
            Store._saveSyncBase();
            console.log('Firebase echo after syncTo — skip conflict detection');
            if (callback) callback(data);
            return;
          }
        }
        
        // ตรวจสอบว่าข้อมูลเปลี่ยนจริงหรือไม่
        const currentJson = JSON.stringify(Store.db);
        const newJson = JSON.stringify(data);
        if (currentJson === newJson) {
          console.log('Firebase data unchanged — skip update');
          return;
        }
        
        // ตรวจจับ conflict ก่อน force update
        const conflictResult = ConflictResolver.detectConflicts(data);
        
        // กรณี remote ใหม่กว่า หรือ local ไม่เปลี่ยน → ใช้ remote
        if (conflictResult && conflictResult.useRemote) {
          console.log('Remote data is newer, using remote data');
          Store.db = data;
          localStorage.setItem(DB_KEY, JSON.stringify(data));
          Store._saveSyncBase();
          if (callback) callback(data);
          return;
        }
        
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
        
        if (conflictResult && conflictResult.autoMergeable && conflictResult.autoMergeable.length > 0) {
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
    
    // โหลด interval จาก settings
    this._loadSyncInterval();
    const intervalMs = (this._syncIntervalSeconds || 10) * 1000;
    
    console.log(`Starting periodic sync every ${this._syncIntervalSeconds || 10} seconds`);
    
    this._periodicInterval = setInterval(async () => {
      // ตรวจสอบ connection status (สำหรับ iOS Safari)
      if (this.db && this.connected) {
        try {
          const snap = await this.db.ref('.info/connected').once('value');
          if (!snap.val()) {
            console.log('Periodic check: Firebase disconnected, triggering reconnect');
            this.connected = false;
            this._emitStatus('offline', 'การเชื่อมต่อขาด — กำลังเชื่อมต่อใหม่...');
            this._scheduleReconnect();
            return;
          }
        } catch (e) {
          console.error('Periodic connection check error:', e);
          this.connected = false;
          this._scheduleReconnect();
          return;
        }
      }
      
      // Sync ข้อมูล
      if (this.connected && !this._syncing) {
        try {
          await this.syncFromFirebase();
        } catch (e) {
          console.error('Periodic sync error:', e);
        }
      }
    }, intervalMs);
  },

  stopPeriodicSync() {
    if (this._periodicInterval) {
      clearInterval(this._periodicInterval);
      this._periodicInterval = null;
    }
  },

  /* ตั้งค่า sync interval */
  setSyncInterval(seconds) {
    this._syncIntervalSeconds = seconds || 10;
    // Restart periodic sync ด้วย interval ใหม่
    if (this.connected) {
      this.startPeriodicSync();
    }
  },

  /* โหลด sync interval จาก localStorage */
  _loadSyncInterval() {
    try {
      const saved = localStorage.getItem('it_stock_sync_interval');
      if (saved) {
        this._syncIntervalSeconds = parseInt(saved) || 10;
      }
    } catch (e) { /* ignore */ }
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
