/* IT Stock Backup API — Cloudflare Worker + KV
 *
 * Endpoints:
 *   GET    /api/backup?key=xxx          → download backup
 *   PUT    /api/backup?key=xxx          → upload backup
 *   DELETE /api/backup?key=xxx          → delete backup
 *   GET    /api/backup/list?key=xxx     → list backups (keys only)
 *   GET    /api/health                  → health check
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (path === '/api/health') {
      return json(corsHeaders, {
        status: 'ok',
        service: 'IT Stock Backup',
        version: '1.0.0',
        timestamp: Date.now(),
      });
    }

    // Backup endpoints
    if (path === '/api/backup') {
      const key = url.searchParams.get('key');
      if (!key || key.length < 3) {
        return json(corsHeaders, { error: 'key parameter required (min 3 chars)' }, 400);
      }

      const kvKey = `backup:${key}`;

      // GET — download backup
      if (method === 'GET') {
        const data = await env.IT_STOCK_KV.get(kvKey, { type: 'json' });
        if (!data) {
          return json(corsHeaders, { error: 'No backup found for this key', key }, 404);
        }
        return json(corsHeaders, data);
      }

      // PUT — upload backup
      if (method === 'PUT') {
        try {
          const body = await request.json();
          if (!body || (!body.items && !body.transactions)) {
            return json(corsHeaders, { error: 'Invalid backup data — must contain items or transactions' }, 400);
          }
          const backupData = {
            ...body,
            _backupAt: Date.now(),
            _backupDate: new Date().toISOString(),
          };
          await env.IT_STOCK_KV.put(kvKey, JSON.stringify(backupData));
          return json(corsHeaders, {
            success: true,
            message: 'Backup uploaded successfully',
            backupAt: backupData._backupAt,
            itemCount: (backupData.items || []).length,
            transactionCount: (backupData.transactions || []).length,
          });
        } catch (e) {
          return json(corsHeaders, { error: 'Invalid JSON body: ' + e.message }, 400);
        }
      }

      // DELETE — delete backup
      if (method === 'DELETE') {
        await env.IT_STOCK_KV.delete(kvKey);
        return json(corsHeaders, { success: true, message: 'Backup deleted' });
      }

      return json(corsHeaders, { error: 'Method not allowed' }, 405);
    }

    // List backups
    if (path === '/api/backup/list') {
      const key = url.searchParams.get('key');
      if (!key) {
        return json(corsHeaders, { error: 'key parameter required' }, 400);
      }
      const kvKey = `backup:${key}`;
      const data = await env.IT_STOCK_KV.get(kvKey, { type: 'json' });
      if (data) {
        return json(corsHeaders, {
          exists: true,
          backupAt: data._backupAt,
          backupDate: data._backupDate,
          itemCount: (data.items || []).length,
          transactionCount: (data.transactions || []).length,
        });
      }
      return json(corsHeaders, { exists: false });
    }

    return json(corsHeaders, { error: 'Not found', endpoints: ['/api/health', '/api/backup?key=xxx'] }, 404);
  },
};

function json(headers, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
