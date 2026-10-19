'use strict';
/* Test runner สำหรับทดสอบ in-app updater จากซอร์ส (ไม่รวมใน build)
   ใช้: ITSTOCK_UPDATE_CHANNEL=1 ITSTOCK_UPDATE_TEST=1 npx electron .
   ทำ: checkForUpdates ผ่าน GitHub จริง → แสดง releaseNotes/files
       → ดาวน์โหลดจริง (sha512 verify + blockmap) → exit 0 เมื่อผ่านหมด */
const { app } = require('electron');

let checkResult = null;

app.whenReady().then(async () => {
  const log = (...a) => console.log('[test-runner]', ...a);
  const fail = (m) => { console.error('[test-runner] FAIL:', m); app.exit(1); };

  const { autoUpdater } = require('./updater'); /* updater.js เซ็ต forceDevUpdateConfig ให้แล้ว */

  /* Step 1: check ผ่าน GitHub จริง */
  try {
    const res = await autoUpdater.checkForUpdates();
    checkResult = res;
    const info = res.updateInfo;
    log('CHECK ok → remote version =', info.version);
    log('releaseNotes type =', typeof info.releaseNotes);
    const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : JSON.stringify(info.releaseNotes);
    log('releaseNotes (first 600 chars) =\n', String(notes || '').slice(0, 600));
    log('files =', JSON.stringify(info.files.map(f => ({ url: f.url, sha512: (f.sha512 || '').slice(0, 16) + '…' }))));
    log('releaseDate =', info.releaseDate);
    if (info.version !== '1.4.19') return fail('remote version ไม่ใช่ 1.4.19: ' + info.version);
  } catch (e) { return fail('checkForUpdates: ' + ((e && e.message) || e)); }

  /* Step 2: กัน race "Please check update first" — เหมือนที่ทำใน production updater.js */
  try {
    if (!autoUpdater.updateInfoAndProvider) {
      log('updateInfoAndProvider = null หลัง await ผล check — re-set จาก getUpdateInfoAndProvider()');
      const gp = await autoUpdater.getUpdateInfoAndProvider();
      autoUpdater.updateInfoAndProvider = gp;
      log('updateInfoAndProvider SET manual =', gp.info.version);
    }
  } catch (e) { return fail('getUpdateInfoAndProvider: ' + ((e && e.message) || e)); }

  /* Step 3: ดาวน์โหลดจริง — รวม sha512 verify อัตโนมัติ + blockmap */
  try {
    let lastPct = -1;
    autoUpdater.on('download-progress', (p) => {
      const pct = Math.round(p.percent);
      if (pct !== lastPct) { lastPct = pct; log('download progress', pct + '%'); }
    });
    const files = await autoUpdater.downloadUpdate(new (require('builder-util-runtime').CancellationToken)());
    const dl = files && files[0];
    log('DOWNLOADED →', dl);
    const fs = require('fs');
    if (!dl || !fs.existsSync(dl)) return fail('downloaded file ไม่พบ: ' + dl);
    const size = fs.statSync(dl).size;
    log('downloaded size =', size);
    log('ALL STEPS PASSED ✅');
    app.exit(0);
  } catch (e) {
    return fail('downloadUpdate: ' + ((e && e.message) || e) + '\n' + (e && e.stack ? e.stack.slice(0, 800) : ''));
  }
});
