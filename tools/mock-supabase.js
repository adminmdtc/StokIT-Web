'use strict';
/* ============================================================
   Mock Supabase server — จำลองพฤติกรรม Supabase ในเครื่อง
   ใช้ทดสอบ Realtime สองหน้าต่าง: REST (PostgREST style) + SSE stream
   รัน: node tools/mock-supabase.js  (พอร์ต 8932)
   ============================================================ */
const http = require('http');

const PORT = 8932;
const TABLES = ['it_items', 'it_transactions', 'it_users', 'it_reorder', 'it_meta'];
const db = {}; // table -> Map(id -> row {id, data, updated_at})
TABLES.forEach(t => { db[t] = new Map(); });

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => { try { resolve(JSON.parse(b || '[]')); } catch (e) { resolve([]); } });
  });
}

const sseClients = new Set();

function broadcast(table, event) {
  const msg = JSON.stringify({ topic: 'realtime:public:' + table, event, commit_timestamp: new Date().toISOString() });
  sseClients.forEach(c => { try { c.res.write(`data: ${msg}\n\n`); } catch (e) { /* drop */ } });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);

  /* ---- CORS preflight ---- */
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    });
    return res.end();
  }

  /* ---- SSE realtime stream ---- */
  if (url.pathname === '/realtime/v1/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Connection': 'keep-alive',
    });
    res.write(':ok\n\n');
    sseClients.add({ res });
    const ping = setInterval(() => { try { res.write(':ping\n\n'); } catch (e) { /* ignore */ } }, 15000);
    req.on('close', () => { clearInterval(ping); for (const c of sseClients) if (c.res === res) sseClients.delete(c); });
    return;
  }

  /* ---- PostgREST style: /rest/v1/{table}[?select=...&id=eq.X] ---- */
  const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
  if (!m) return json(res, 404, { message: 'not found: ' + url.pathname });
  const table = m[1];
  if (!TABLES.includes(table)) return json(res, 404, { message: 'relation ' + table + ' does not exist' });

  const idFilter = (url.searchParams.get('id') || '').match(/^eq\.(.+)$/);
  const delAll = (url.searchParams.get('id') || '').startsWith('neq.');

  if (req.method === 'GET') {
    let rows = [...db[table].values()];
    if (idFilter) rows = rows.filter(r => r.id === decodeURIComponent(idFilter[1]));
    return json(res, 200, rows);
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const rows = Array.isArray(body) ? body : [body];
    const merge = (req.headers['prefer'] || '').includes('merge-duplicates');
    for (const r of rows) {
      if (!r || !r.id) continue;
      if (db[table].has(r.id) && !merge) {
        return json(res, 409, { message: 'duplicate key: ' + r.id });
      }
      db[table].set(r.id, r);
      broadcast(table, 'INSERT');
    }
    return json(res, 201, rows);
  }

  if (req.method === 'DELETE') {
    if (delAll) {
      const n = db[table].size;
      db[table].clear();
      if (n) broadcast(table, 'DELETE');
      return json(res, 204);
    }
    if (!idFilter) return json(res, 400, { message: 'missing id filter' });
    const id = decodeURIComponent(idFilter[1]);
    const existed = db[table].delete(id);
    if (existed) broadcast(table, 'DELETE');
    return json(res, 204);
  }

  return json(res, 405, { message: 'method not allowed' });
});

server.listen(PORT, () => console.log('Mock Supabase on http://localhost:' + PORT));
