'use strict';

/* ============================================================
   Hybrid Sync — ซิงค์ข้อมูลทั้ง Firebase และ Local Network
   รองรับทั้งเน็ตส่วนตัว (4G/5G) และเครือข่ายท้องถิ่น (WiFi)
   ============================================================ */

const HybridSync = {
  /* ---------- Config ---------- */
  config: {
    firebase: null,      // Firebase config
    localServer: null,   // Local sync server URL
    mode: 'auto',        // 'auto' | 'firebase' | 'local' | 'both'
  },
  
  /* ---------- State ---------- */
  state: {
    firebaseConnected: false,
    localConnected: false,
    lastSyncSource: null,
    lastSyncTime: null,
    syncing: false,
  },
  
  /* ---------- WebSocket ---------- */
  _ws: null,
  _wsReconnectTimer: null,
  _wsReconnectAttempts: 0,
  _wsMaxReconnectAttempts: 10,
  _heartbeatInterval: null,
  _localDataVersion: 0,
  
  /* ---------- Callbacks ---------- */
  _statusCallbacks: [],
  _dataCallbacks: [],
  
  /* ============================================================
     Initialization
     ============================================================ */
  
  init() {
    // โหลด config จาก localStorage
    this.loadConfig();
    
    // ลงทะเบียน callbacks
    this._setupCallbacks();
    
    console.log('HybridSync initialized');
  },
  
  _setupCallbacks() {
    // Firebase status callback
    if (typeof FirebaseDB !== 'undefined') {
      FirebaseDB.onStatusChange((status, message) => {
        this.state.firebaseConnected = (status === 'connected');
        this._emitStatus();
      });
    }
  },
  
  /* ============================================================
     Config Management
     ============================================================ */
  
  loadConfig() {
    try {
      const raw = localStorage.getItem('it_stock_hybrid_sync_config');
      if (raw) {
        this.config = { ...this.config, ...JSON.parse(raw) };
      }
    } catch (e) { /* ignore */ }
    
    // โหลด local server URL
    const localUrl = localStorage.getItem('it_stock_local_sync_url');
    if (localUrl) {
      this.config.localServer = localUrl;
    }
    
    return this.config;
  },
  
  saveConfig(config) {
    this.config = { ...this.config, ...config };
    localStorage.setItem('it_stock_hybrid_sync_config', JSON.stringify(this.config));
    
    if (config.localServer) {
      localStorage.setItem('it_stock_local_sync_url', config.localServer);
    }
  },
  
  /* ============================================================
     Connection Management
     ============================================================ */
  
  async connect() {
    console.log('HybridSync connecting...');
    
    // เชื่อมต่อ Firebase (ถ้ามี config)
    if (this.config.firebase && typeof FirebaseDB !== 'undefined') {
      try {
        const connected = await FirebaseDB.connect();
        this.state.firebaseConnected = connected;
        if (connected) {
          console.log('Firebase connected');
          // เริ่มฟัง real-time updates
          FirebaseDB.onChanges((data) => {
            this._handleDataUpdate(data, 'firebase');
          });
        }
      } catch (e) {
        console.error('Firebase connect error:', e);
      }
    }
    
    // เชื่อมต่อ Local Server (ถ้ามี URL)
    if (this.config.localServer) {
      this._connectLocalServer();
    }
    
    this._emitStatus();
    return this.state.firebaseConnected || this.state.localConnected;
  },
  
  disconnect() {
    this._disconnectLocalServer();
    
    if (typeof FirebaseDB !== 'undefined') {
      FirebaseDB.disconnect();
    }
    
    this.state.firebaseConnected = false;
    this.state.localConnected = false;
    this._emitStatus();
  },
  
  /* ============================================================
     Local Server Connection
     ============================================================ */
  
  _connectLocalServer() {
    if (!this.config.localServer) return;
    
    this._disconnectLocalServer();
    
    const wsUrl = this.config.localServer.replace('http', 'ws');
    
    try {
      this._ws = new WebSocket(wsUrl);
      
      this._ws.onopen = () => {
        console.log('Local sync connected:', this.config.localServer);
        this.state.localConnected = true;
        this._wsReconnectAttempts = 0;
        this._emitStatus();
        
        // เริ่ม heartbeat
        this._startHeartbeat();
        
        // ขอข้อมูลล่าสุด
        this._ws.send(JSON.stringify({ type: 'request_sync' }));
      };
      
      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleLocalMessage(msg);
        } catch (e) {
          console.error('Local sync message error:', e);
        }
      };
      
      this._ws.onclose = () => {
        console.log('Local sync disconnected');
        this.state.localConnected = false;
        this._stopHeartbeat();
        this._emitStatus();
        
        // Reconnect
        this._scheduleReconnect();
      };
      
      this._ws.onerror = (err) => {
        console.error('Local sync error:', err);
        this.state.localConnected = false;
        this._emitStatus();
      };
      
    } catch (e) {
      console.error('Local sync connect error:', e);
      this._scheduleReconnect();
    }
  },
  
  _disconnectLocalServer() {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._stopHeartbeat();
    if (this._wsReconnectTimer) {
      clearTimeout(this._wsReconnectTimer);
      this._wsReconnectTimer = null;
    }
  },
  
  _scheduleReconnect() {
    if (this._wsReconnectAttempts >= this._wsMaxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, this._wsReconnectAttempts), 30000);
    this._wsReconnectAttempts++;
    
    console.log(`Reconnecting to local server in ${delay}ms...`);
    
    this._wsReconnectTimer = setTimeout(() => {
      this._connectLocalServer();
    }, delay);
  },
  
  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatInterval = setInterval(() => {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  },
  
  _stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  },
  
  /* ============================================================
     Message Handling
     ============================================================ */
  
  _handleLocalMessage(msg) {
    switch (msg.type) {
      case 'sync':
        // ข้อมูลจาก server
        if (msg.data) {
          this._handleDataUpdate(msg.data, 'local');
          this._localDataVersion = msg.version || 0;
        }
        break;
      
      case 'update':
        // มีข้อมูลอัพเดทจาก client อื่น
        if (msg.data) {
          this._handleDataUpdate(msg.data, 'local');
          this._localDataVersion = msg.version || 0;
        }
        break;
      
      case 'sync_ack':
        console.log('Local sync acknowledged:', msg.version);
        break;
      
      case 'system':
        // แจ้งเตือนจาก server
        if (msg.type === 'client_joined') {
          console.log(`Client joined: ${msg.clientIP}`);
        } else if (msg.type === 'client_left') {
          console.log(`Client left: ${msg.clientIP}`);
        }
        break;
      
      case 'pong':
        // Heartbeat response
        break;
      
      case 'heartbeat_ack':
        break;
    }
  },
  
  _handleDataUpdate(data, source) {
    if (this.state.syncing) return;
    
    console.log(`Data update from ${source}`);
    
    this.state.lastSyncSource = source;
    this.state.lastSyncTime = Date.now();
    
    // อัพเดท Store
    if (typeof Store !== 'undefined' && data) {
      Store.db = data;
      localStorage.setItem('it_stock_db_v5', JSON.stringify(data));
    }
    
    // แจ้ง callbacks
    this._emitDataUpdate(data, source);
  },
  
  /* ============================================================
     Data Sync
     ============================================================ */
  
  async syncToAll() {
    if (this.state.syncing) return;
    
    this.state.syncing = true;
    this._emitStatus();
    
    try {
      const data = Store.db;
      
      // Sync ไป Firebase
      if (this.state.firebaseConnected && typeof FirebaseDB !== 'undefined') {
        try {
          await FirebaseDB.syncToFirebase();
          console.log('Synced to Firebase');
        } catch (e) {
          console.error('Firebase sync error:', e);
        }
      }
      
      // Sync ไป Local Server
      if (this.state.localConnected && this._ws) {
        try {
          data._version = (data._version || 0) + 1;
          data._lastSync = Date.now();
          
          this._ws.send(JSON.stringify({
            type: 'sync',
            data,
          }));
          
          console.log('Synced to local server');
        } catch (e) {
          console.error('Local sync error:', e);
        }
      }
      
      this.state.lastSyncTime = Date.now();
      this._emitStatus();
      
    } finally {
      this.state.syncing = false;
      this._emitStatus();
    }
  },
  
  async syncFromBestSource() {
    // เลือกแหล่งข้อมูลที่ดีที่สุด
    // Priority: Firebase > Local Server
    
    if (this.state.firebaseConnected && typeof FirebaseDB !== 'undefined') {
      try {
        await FirebaseDB.syncFromFirebase();
        console.log('Synced from Firebase');
        return true;
      } catch (e) {
        console.error('Firebase sync from error:', e);
      }
    }
    
    if (this.state.localConnected && this._ws) {
      this._ws.send(JSON.stringify({ type: 'request_sync' }));
      console.log('Requested sync from local server');
      return true;
    }
    
    return false;
  },
  
  /* ============================================================
     Status & Events
     ============================================================ */
  
  onStatusChange(callback) {
    this._statusCallbacks.push(callback);
  },
  
  onDataUpdate(callback) {
    this._dataCallbacks.push(callback);
  },
  
  _emitStatus() {
    const status = this.getStatus();
    this._statusCallbacks.forEach(cb => {
      try { cb(status); } catch (e) { console.error('Status callback error:', e); }
    });
  },
  
  _emitDataUpdate(data, source) {
    this._dataCallbacks.forEach(cb => {
      try { cb(data, source); } catch (e) { console.error('Data callback error:', e); }
    });
  },
  
  getStatus() {
    return {
      firebaseConnected: this.state.firebaseConnected,
      localConnected: this.state.localConnected,
      anyConnected: this.state.firebaseConnected || this.state.localConnected,
      lastSyncSource: this.state.lastSyncSource,
      lastSyncTime: this.state.lastSyncTime,
      syncing: this.state.syncing,
      localServerUrl: this.config.localServer,
      connectionType: this._getConnectionType(),
    };
  },
  
  _getConnectionType() {
    if (this.state.firebaseConnected && this.state.localConnected) return 'both';
    if (this.state.firebaseConnected) return 'firebase';
    if (this.state.localConnected) return 'local';
    return 'none';
  },
  
  /* ============================================================
     Utility Functions
     ============================================================ */
  
  async testLocalConnection(url) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      }
      return { success: false, error: 'Server returned error' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  
  getLocalServerUrl() {
    // ลองค้นหา local server อัตโนมัติ
    return this.config.localServer;
  },
  
  setLocalServer(url) {
    this.config.localServer = url;
    localStorage.setItem('it_stock_local_sync_url', url);
    
    // เชื่อมต่อใหม่
    if (url) {
      this._connectLocalServer();
    } else {
      this._disconnectLocalServer();
    }
  },
};

/* ============================================================
   Auto-init
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  HybridSync.init();
});

/* ============================================================
   Export
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HybridSync;
}