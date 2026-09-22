'use strict';
/* ============================================================
   ปุ่ม "อัปเดตโปรแกรม" บนแถบด้านบน — เฉพาะแอปเดสก์ท็อป (Electron)
   เช็คเวอร์ชันจาก GitHub Releases → ดาวน์โหลด → รีสตาร์ทติดตั้ง
   (เว็บไม่แสดงปุ่มนี้ — electronUpdater มีเฉพาะใน Electron)
   ============================================================ */

(function () {
  function initAppUpdater() {
    const btn = document.getElementById('btn-update-app');
    if (!btn) return;
    if (!window.electronUpdater || !window.electronUpdater.isDesktop) return; // บนเว็บ: ซ่อน

    const label = document.getElementById('btn-update-label');
    const origLabel = 'อัปเดตโปรแกรม';
    let downloaded = false;

    btn.style.display = '';

    function setLabel(t, cls) {
      if (label) label.textContent = t;
      if (cls !== undefined) btn.dataset.state = cls;
      else delete btn.dataset.state;
    }

    btn.addEventListener('click', async () => {
      const st = btn.dataset.state || '';
      if (st === 'downloading') return;
      try {
        if (downloaded) {
          await window.electronUpdater.install();           // รีสตาร์ทติดตั้ง
          return;
        }
        if (st === 'available') {
          setLabel('กำลังดาวน์โหลด 0%', 'downloading');
          await window.electronUpdater.download();
          return;
        }

        // เช็คเวอร์ชัน
        setLabel('กำลังเช็ค...', undefined);
        btn.disabled = true;
        const res = await window.electronUpdater.check();
        btn.disabled = false;

        if (res && res.status === 'available') {
          setLabel('อัปเดตเป็น v' + res.newVersion, 'available');
          toast('มีเวอร์ชันใหม่ v' + res.newVersion + ' — กดปุ่มอีกครั้งเพื่อดาวน์โหลด', 'info');
        } else if (res && res.status === 'up-to-date') {
          setLabel(origLabel, undefined);
          toast('คุณใช้เวอร์ชันล่าสุดแล้ว (v' + (res.currentVersion || '') + ') ✅', 'success');
        } else {
          setLabel(origLabel, undefined);
          toast('เช็คอัปเดตไม่สำเร็จ: ' + ((res && res.message) || 'ไม่ทราบสาเหตุ') + '\nตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 'error');
        }
      } catch (e) {
        btn.disabled = false;
        setLabel(origLabel, undefined);
        toast('เกิดข้อผิดพลาด: ' + (e && e.message ? e.message : e), 'error');
      }
    });

    // ความคืบหน้าดาวน์โหลด + สถานะจาก main process
    window.electronUpdater.onUpdateEvent((data) => {
      if (!data) return;
      if (data.status === 'downloading') {
        setLabel('กำลังดาวน์โหลด ' + Math.round(data.percent || 0) + '%', 'downloading');
      } else if (data.status === 'downloaded') {
        downloaded = true;
        setLabel('รีสตาร์ทเพื่อติดตั้ง', 'downloaded');
        toast('ดาวน์โหลดเสร็จ — กดปุ่มเพื่อรีสตาร์ทและติดตั้งเวอร์ชันใหม่', 'success');
      } else if (data.status === 'error') {
        if (btn.dataset.state === 'downloading') {
          setLabel('ดาวน์โหลดไม่สำเร็จ — กดลองใหม่', 'available');
          toast('ดาวน์โหลดไม่สำเร็จ: ' + (data.message || '') , 'error');
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAppUpdater);
  else initAppUpdater();
})();
