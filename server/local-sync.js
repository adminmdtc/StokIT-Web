'use strict';

/* ============================================================
   IT Stock — Local Sync Server
   ใช้ WebSocket สำหรับซิงค์ข้อมูลบนเครือข่ายท้องถิ่น
   ไม่ต้องพึ่งอินเทอร์เน็ต (ใช้ WiFi เดียวกัน)
   ============================================================ */

const http = require('http');
const { WebSocketServer } = require('ws');
const os = require('os');

/* ---------- Config ---------- */
const PORT = process.env.PORT || 3766;
const HOST = '0.0.0.0';

/* ---------- ข้อมูลในหน่วยความจำ ---------- */
let currentData = null;
let lastUpdate = Date.now();
const clients = new Set();

/* ---------- Helper Functions ---------- */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function log(msg) {
  const time = new Date().toLocaleTimeString('th-TH');
  console.log(`[${time}] ${msg}`);
}

/* ---------- HTTP Server ---------- */
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      clients: clients.size,
      lastUpdate: new Date(lastUpdate).toISOString(),
      dataVersion: currentData?._version || 0,
    }));
    return;
  }

  // Get current data
  if (req.url === '/api/data' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(currentData));
    return;
  }

  // Update data via HTTP (fallback)
  if (req.url === '/api/data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        currentData = data;
        currentData._version = (currentData._version || 0) + 1;
        currentData._lastSync = Date.now();
        lastUpdate = Date.now();
        
        // Broadcast to all WebSocket clients
        broadcastData(currentData, null);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, version: currentData._version }));
        log(`Data updated via HTTP (v${currentData._version})`);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Server info
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'IT Stock Local Sync Server',
      version: '1.0.0',
      status: 'running',
      clients: clients.size,
      localIP: getLocalIP(),
      port: PORT,
      endpoints: {
        health: '/health',
        data: '/api/data',
        websocket: `ws://${getLocalIP()}:${PORT}`,
      }
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

/* ---------- WebSocket Server ---------- */
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  const clientId = `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  
  clients.add(ws);
  ws._clientId = clientId;
  ws._clientIP = clientIP;
  
  log(`Client connected: ${clientIP} (${clientId})`);
  
  // ส่งข้อมูลปัจจุบันให้ client ใหม่
  if (currentData) {
    ws.send(JSON.stringify({
      type: 'sync',
      data: currentData,
      version: currentData._version || 0,
    }));
  }
  
  // แจ้งเตือน client อื่น
  broadcastSystemMessage({
    type: 'client_joined',
    clientId,
    clientIP,
    totalClients: clients.size,
  }, ws);
  
  // รับข้อความจาก client
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      handleMessage(ws, msg);
    } catch (e) {
      log(`Invalid message from ${clientIP}: ${e.message}`);
    }
  });
  
  // เมื่อ client ตัดการเชื่อมต่อ
  ws.on('close', () => {
    clients.delete(ws);
    log(`Client disconnected: ${clientIP} (${clientId})`);
    
    broadcastSystemMessage({
      type: 'client_left',
      clientId,
      clientIP,
      totalClients: clients.size,
    });
  });
  
  ws.on('error', (err) => {
    log(`Client error: ${clientIP} - ${err.message}`);
    clients.delete(ws);
  });
});

/* ---------- Message Handler ---------- */
function handleMessage(ws, msg) {
  const clientIP = ws._clientIP;
  
  switch (msg.type) {
    case 'sync':
      // Client ส่งข้อมูลมา sync
      if (msg.data && typeof msg.data === 'object') {
        const newVersion = (msg.data._version || 0) + 1;
        msg.data._version = newVersion;
        msg.data._lastSync = Date.now();
        currentData = msg.data;
        lastUpdate = Date.now();
        
        // Broadcast ไปหา client อื่น
        broadcastData(currentData, ws);
        
        // แจ้ง client ที่ส่งมา
        ws.send(JSON.stringify({
          type: 'sync_ack',
          version: newVersion,
          ok: true,
        }));
        
        log(`Data synced from ${clientIP} (v${newVersion})`);
      }
      break;
    
    case 'request_sync':
      // Client ขอข้อมูลล่าสุด
      ws.send(JSON.stringify({
        type: 'sync',
        data: currentData,
        version: currentData?._version || 0,
      }));
      log(`Sync request from ${clientIP}`);
      break;
    
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
      break;
    
    case 'heartbeat':
      ws.send(JSON.stringify({ type: 'heartbeat_ack', time: Date.now() }));
      break;
    
    default:
      log(`Unknown message type from ${clientIP}: ${msg.type}`);
  }
}

/* ---------- Broadcast Functions ---------- */
function broadcastData(data, excludeWs) {
  const message = JSON.stringify({
    type: 'update',
    data,
    version: data._version || 0,
    timestamp: Date.now(),
  });
  
  clients.forEach(client => {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(message);
    }
  });
}

function broadcastSystemMessage(msg, excludeWs) {
  const message = JSON.stringify({
    type: 'system',
    ...msg,
    timestamp: Date.now(),
  });
  
  clients.forEach(client => {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(message);
    }
  });
}

/* ---------- Start Server ---------- */
server.listen(PORT, HOST, () => {
  const localIP = getLocalIP();
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           IT Stock — Local Sync Server                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  🌐 Local URL:    http://${localIP}:${PORT}`.padEnd(62) + '║');
  console.log(`║  🔌 WebSocket:    ws://${localIP}:${PORT}`.padEnd(62) + '║');
  console.log(`║  📊 Health:       http://${localIP}:${PORT}/health`.padEnd(62) + '║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  📱 เปิดแอป IT Stock แล้วไปที่:                           ║');
  console.log(`║     ตั้งค่า → Local Sync → ${localIP}:${PORT}`.padEnd(62) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');
});

/* ---------- Graceful Shutdown ---------- */
process.on('SIGINT', () => {
  log('Shutting down...');
  wss.clients.forEach(client => client.close());
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Shutting down...');
  wss.clients.forEach(client => client.close());
  server.close();
  process.exit(0);
});