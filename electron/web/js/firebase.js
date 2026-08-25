'use strict';

/* ============================================================
   Firebase — เชื่อมต่อ Firebase Realtime Database
   สำหรับ sync ข้อมูลหลายเครื่อง
   ระบบง่าย: syncToFirebase ส่งข้อมูล, onChanges รับข้อมูล + merge
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

  saveConfig(config) {
    this.config = config;
    localStorage.setItem('it_stock_firebase_config', JSON.stringify(config));
  },

  clearConfig() {
    this.config = null;
    localStorage.removeItem('it_stock_firebase_config');
    this.stopPeriodicSync();
  },

  onStatusChange(callback) {
    this._statusCallbacks.push(callback);
  },

  _emitStatus(status, message) {
    this._statusCallbacks.forEach(cb => {
      try { cb(status, message); } catch (e) { console.error('Status callback error:', e); }
    });
  },

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
      
      this.startPeriodicSync();
      this._startConnectionMonitor();
      
      return true;
    } catch (e) {
      console.error('Firebase connect error:', e);
      this.connected = false;
      this._emitStatus('error', 'เชื่อมต่อล้มเหลว');
      return false;
    }
  },

  _startConnectionMonitor() {
    this._stopConnectionMonitor();
    if (!this.db) return;
    
    const connectedRef = this.db.ref('.info/connected');
    this._connectionMonitorRef = connectedRef;
    
    connectedRef.on('value', (snap) => {
      if (snap.val()) {
        this._reconnectAttempts = 0;
        this.connected = true;
        this._emitStatus('connected', 'เชื่อมต่อแล้ว');
      } else {
        this.connected = false;
        this._emitStatus('offline', 'การเชื่อมต่อขาด');
        this._scheduleReconnect();
      }
    });
    
    this._visibilityChangeHandler = () => {
      if (document.visibilityState === 'visible') this._checkAndReconnect();
    };
    document.addEventListener('visibilitychange', this._visibilityChangeHandler);
    
    this._onlineHandler = () => { setTimeout(() => this._checkAndReconnect(), 1000); };
    this._offlineHandler = () => { this._emitStatus('offline', 'ออฟไลน์'); };
    window.addEventListener('online', this._onlineHandler);
    window.addEventListener('offline', this._offlineHandler);
  },

  _stopConnectionMonitor() {
    if (this._connectionMonitorRef) { this._connectionMonitorRef.off(); this._connectionMonitorRef = null; }
    if (this._visibilityChangeHandler) { document.removeEventListener('visibilitychange', this._visibilityChangeHandler); this._visibilityChangeHandler = null; }
    if (this._onlineHandler) { window.removeEventListener('online', this._onlineHandler); this._onlineHandler = null; }
    if (this._offlineHandler) { window.removeEventListener('offline', this._offlineHandler); this._offlineHandler = null; }
  },

  async _checkAndReconnect() {
    if (!this.db) return;
    try {
      const snap = await this.db.ref('.info/connected').once('value');
      if (!snap.val()) { this.connected = false; this._emitStatus('offline', 'กำลังเชื่อมต่อใหม่...'); this._scheduleReconnect(); }
    } catch (e) { this._scheduleReconnect(); }
  },

  _scheduleReconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      this._emitStatus('error', 'เชื่อมต่อล้มเหลว'); return;
    }
    const delay = Math.min(this._baseReconnectDelay * Math.pow(2, this._reconnectAttempts), 30000);
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectAttempts++;
      try { await this._forceReconnect(); } catch (e) { this._scheduleReconnect(); }
    }, delay + Math.random() * 1000);
  },

  async _forceReconnect() {
    if (!this.config) return;
    this._emitStatus('connecting', 'กำลังเชื่อมต่อใหม่...');
    try {
      this._stopConnectionMonitor();
      if (this.db) { this.db.goOffline(); this.db.goOnline(); }
      const snap = await this.db.ref('.info/connected').once('value');
      if (snap.val()) {
        this.connected = true; this._reconnectAttempts = 0;
        this._emitStatus('connected', 'เชื่อมต่อใหม่สำเร็จ');
        this._startConnectionMonitor();
        await this.syncFromFirebase();
      } else {
        this.connected = false; this._emitStatus('offline', 'กำลังเชื่อมต่อใหม่...');
        this._startConnectionMonitor(); this._scheduleReconnect();
      }
    } catch (e) { this.connected = false; this._emitStatus('error', 'เชื่อมต่อล้มเหลว'); this._scheduleReconnect(); }
  },

  disconnect() {
    this.stopPeriodicSync();
    this._stopConnectionMonitor();
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    this._reconnectAttempts = 0;
    if (this.db) { this._listeners.forEach(ref => ref.off()); this._listeners = []; this.db.goOffline(); }
    this.connected = false; this.db = null;
    this._emitStatus('offline', 'ยกเลิกการเชื่อมต่อ');
  },

  /* ============================================================
     Sync Operations — ระบบง่าย ไม่ใช้ conflict detection
     ============================================================ */

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
    
    return {
      items: localItems.filter(i => !remoteItemIds.has(i.id)),
      transactions: localTransactions.filter(t => !remoteTxIds.has(t.id)),
      users: localUsers.filter(u => !remoteUserIds.has(u.id)),
    };
  },

  async syncToFirebase() {
    if (!this.connected || !this.db) return false;
    if (this._syncing) return false;
    
    this._syncing = true;
    this._justSynced = true;
    this._justSyncedTime = Date.now();
    this._emitStatus('syncing', 'กำลังบันทึก...');
    try {
      await this.db.ref('itstock').set(Store.db);
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

  async syncFromFirebase() {
    if (!this.connected || !this.db) return false;
    if (this._syncing) return false;
    
    this._syncing = true;
    this._emitStatus('syncing', 'กำลังซิงค์ข้อมูล...');
    try {
      const snapshot = await this.db.ref('itstock').once('value');
      const remoteData = snapshot.val();
      
      if (remoteData && typeof remoteData.items === 'object') {
        const localOnly = this._getLocalOnlyData(remoteData);
        Store.db = remoteData;
        
        if (!Store.db.items) Store.db.items = [];
        if (!Store.db.transactions) Store.db.transactions = [];
        if (!Store.db.users) Store.db.users = [];
        
        localOnly.items.forEach(item => {
          if (!Store.db.items.find(x => x.id === item.id)) Store.db.items.push(item);
        });
        localOnly.transactions.forEach(tx => {
          if (!Store.db.transactions.find(x => x.id === tx.id)) Store.db.transactions.push(tx);
        });
        localOnly.users.forEach(u => {
          if (!Store.db.users.find(x => x.id === u.id)) Store.db.users.push(u);
        });
        
        localStorage.setItem(DB_KEY, JSON.stringify(Store.db));
        Store._saveSyncBase();
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

  onChanges(callback) {
    if (!this.connected || !this.db) return;
    
    this._listeners.forEach(ref => ref.off());
    this._listeners = [];
    
    const ref = this.db.ref('itstock');
    ref.on('value', async (snapshot) => {
      const data = snapshot.val();
      if (!data || typeof data !== 'object') return;
      
      if (this._justSynced) {
        this._justSynced = false;
        const timeDiff = Date.now() - (this._justSyncedTime || 0);
        if (timeDiff < 5000) { console.log('Firebase echo — skip'); return; }
      }
      
      const currentJson = JSON.stringify(Store.db);
      const newJson = JSON.stringify(data);
      if (currentJson === newJson) { console.log('Firebase data unchanged — skip'); return; }
      
      console.log('Firebase real-time update received');
      
      const localOnly = this._getLocalOnlyData(data);
      Store.db = data;
      
      if (!Store.db.items) Store.db.items = [];
      if (!Store.db.transactions) Store.db.transactions = [];
      if (!Store.db.users) Store.db.users = [];
      
      localOnly.items.forEach(item => {
        if (!Store.db.items.find(x => x.id === item.id)) Store.db.items.push(item);
      });
      localOnly.transactions.forEach(tx => {
        if (!Store.db.transactions.find(x => x.id === tx.id)) Store.db.transactions.push(tx);
      });
      localOnly.users.forEach(u => {
        if (!Store.db.users.find(x => x.id === u.id)) Store.db.users.push(u);
      });
      
      localStorage.setItem(DB_KEY, JSON.stringify(Store.db));
      Store._saveSyncBase();
      
      if (callback) callback(data);
    });
    
    this._listeners.push(ref);
  },

  stopListening() {
    this._listeners.forEach(ref => ref.off());
    this._listeners = [];
  },

  startPeriodicSync() {
    this.stopPeriodicSync();
    this._loadSyncInterval();
    const intervalMs = (this._syncIntervalSeconds || 10) * 1000;
    
    this._periodicInterval = setInterval(async () => {
      if (this.connected && !this._syncing) {
        try { await this.syncFromFirebase(); } catch (e) { console.error('Periodic sync error:', e); }
      }
    }, intervalMs);
  },

  stopPeriodicSync() {
    if (this._periodicInterval) { clearInterval(this._periodicInterval); this._periodicInterval = null; }
  },

  setSyncInterval(seconds) {
    this._syncIntervalSeconds = seconds || 10;
    if (this.connected) this.startPeriodicSync();
  },

  _loadSyncInterval() {
    try {
      const saved = localStorage.getItem('it_stock_sync_interval');
      if (saved) this._syncIntervalSeconds = parseInt(saved) || 10;
    } catch (e) { /* ignore */ }
  },

  async testConnection() {
    if (!this.connected || !this.db) return { success: false, error: 'Not connected' };
    try { await this.db.ref('.info/connected').once('value'); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  },
};

function isFirebaseEnabled() {
  return FirebaseDB.connected && FirebaseDB.config;
}

async function autoSyncToFirebase() {
  if (isFirebaseEnabled()) {
    try { return await FirebaseDB.syncToFirebase(); } catch (e) { console.error('Auto sync failed:', e); return false; }
  }
  return false;
}

async function autoSyncFromFirebase() {
  if (isFirebaseEnabled()) {
    const success = await FirebaseDB.syncFromFirebase();
    if (success && typeof route === 'function') route();
    return success;
  }
  return false;
}
