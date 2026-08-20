'use strict';

/* ============================================================
   Telegram Notification — ระบบแจ้งเตือนผ่าน Telegram
   ============================================================ */

const Telegram = {
  /* ---------- ตั้งค่า ---------- */
  getConfig() {
    try {
      const raw = localStorage.getItem('it_stock_telegram');
      return raw ? JSON.parse(raw) : { botToken: '', chatId: '', enabled: false };
    } catch (e) { return { botToken: '', chatId: '', enabled: false }; }
  },
  saveConfig(cfg) {
    localStorage.setItem('it_stock_telegram', JSON.stringify(cfg));
  },
  isConfigured() {
    const cfg = this.getConfig();
    return cfg.enabled && cfg.botToken && cfg.chatId;
  },

  /* ---------- ส่งข้อความ ---------- */
  async sendMessage(text) {
    const cfg = this.getConfig();
    if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;
    try {
      const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      });
      const data = await resp.json();
      if (!data.ok) {
        console.error('Telegram error:', data.description);
      }
      return data;
    } catch (err) {
      console.error('Telegram send failed:', err);
    }
  },

  /* ---------- แจ้งเตือนการรับเข้า ---------- */
  async notifyReceive(tx) {
    if (!this.isConfigured()) return;
    const items = tx.items.map(l => `  • ${escHtml(l.name)} × ${l.qty}`).join('\n');
    const text = [
      `📦 <b>แจ้งเตือนรับเข้าวัสดุ</b>`,
      ``,
      `📄 เลขที่: <code>${escHtml(tx.no)}</code>`,
      `📅 วันที่: ${tx.date}`,
      `👤 ผู้บันทึก: ${escHtml(tx.byName)}`,
      ``,
      `<b>รายการ:</b>`,
      items,
    ].join('\n');
    await this.sendMessage(text);
  },

  /* ---------- แจ้งเตือนการจำหน่าย/เบิก ---------- */
  async notifyIssue(tx) {
    if (!this.isConfigured()) return;
    const items = tx.items.map(l => `  • ${escHtml(l.name)} × ${l.qty}`).join('\n');
    const text = [
      `📤 <b>แจ้งเตือนจำหน่าย/เบิกวัสดุ</b>`,
      ``,
      `📄 เลขที่: <code>${escHtml(tx.no)}</code>`,
      `📅 วันที่: ${tx.date}`,
      `🏢 ผู้รับ: ${escHtml(tx.party)}`,
      `👤 ผู้บันทึก: ${escHtml(tx.byName)}`,
      ``,
      `<b>รายการ:</b>`,
      items,
    ].join('\n');
    await this.sendMessage(text);
  },

  /* ---------- แจ้งเตือนวัสดุใกล้หมด ---------- */
  async notifyLowStock(lowItems) {
    if (!this.isConfigured() || !lowItems.length) return;
    const lines = lowItems.map(s => {
      const status = s.qty <= 0 ? '🔴 หมด' : '🟡 ใกล้หมด';
      return `  ${status} ${escHtml(s.name)} (${escHtml(s.code)}) — เหลือ ${s.qty} ${s.unit}`;
    }).join('\n');
    const text = [
      `⚠️ <b>แจ้งเตือนวัสดุใกล้หมด / หมดคลัง</b>`,
      ``,
      `<b>จำนวน ${lowItems.length} รายการ:</b>`,
      lines,
    ].join('\n');
    await this.sendMessage(text);
  },

  /* ---------- แจ้งเตือนสรุปยอดรายวัน ---------- */
  async notifyDailySummary() {
    if (!this.isConfigured()) return;
    const today = todayStr();
    const txs = Store.transactions().filter(t => t.date === today);
    const rcv = txs.filter(t => t.type === 'receive');
    const iss = txs.filter(t => t.type === 'issue');
    const stock = Store.getStock();
    const lowItems = stock.filter(s => s.status !== 'ok');

    const rcvQty = rcv.reduce((s, t) => s + t.items.reduce((a, l) => a + l.qty, 0), 0);
    const issQty = iss.reduce((s, t) => s + t.items.reduce((a, l) => a + l.qty, 0), 0);

    const text = [
      `📊 <b>สรุปยอดวันนี้ (${today})</b>`,
      ``,
      `📦 รับเข้า: ${rcv.length} เอกสาร / ${rcvQty} ชิ้น`,
      `📤 จำหน่าย: ${iss.length} เอกสาร / ${issQty} ชิ้น`,
      `📋 รายการวัสดุทั้งหมด: ${stock.length} รายการ`,
      lowItems.length ? `\n⚠️ วัสดุใกล้หมด/หมด: ${lowItems.length} รายการ` : `\n✅ วัสดุอยู่ในระดับปกติทั้งหมด`,
    ].join('\n');
    await this.sendMessage(text);
  },
};

/* ---------- Helper: escape HTML for Telegram ---------- */
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
