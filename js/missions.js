'use strict';

/* ============================================================
   ข้อมูลภารกิจ กลุ่มงาน และงาน (โครงสร้าง ปีงบประมาณ 64)
   ============================================================ */
const MISSIONS = [
  {
    id: 'm1',
    name: 'ภารกิจด้านอำนวยการ',
    groups: [
      { id: 'g1', name: 'กลุ่มงานบริหารทั่วไป', units: [
        'งานเลขานุการและงานธุรการ',
        'งานบริหารทั่วไป',
        'งานทรัพยากรบุคคล',
        'งานยุทธศาสตร์และแผนงาน'
      ]},
      { id: 'g2', name: 'กลุ่มงานการเงิน บัญชี และพัสดุ', units: [
        'งานการเงินและบัญชี',
        'งานพัสดุและบำรุงรักษา'
      ]}
    ]
  },
  {
    id: 'm2',
    name: 'ภารกิจด้านวิชาการและการแพทย์',
    groups: [
      { id: 'g3', name: 'กลุ่มงานเวชศาสตร์สารเสพติด', units: [] },
      { id: 'g4', name: 'กลุ่มงานจิตวิทยา', units: [] },
      { id: 'g5', name: 'กลุ่มงานฟื้นฟูสมรรถภาพ', units: [] },
      { id: 'g6', name: 'กลุ่มงานเภสัชกรรม', units: [] },
      { id: 'g7', name: 'กลุ่มงานสังคมสงเคราะห์ทางการแพทย์', units: [] },
      { id: 'g8', name: 'กลุ่มงานโภชนศาสตร์', units: [] }
    ]
  },
  {
    id: 'm3',
    name: 'ภารกิจด้านการพยาบาล',
    groups: [
      { id: 'g9', name: 'กลุ่มงานการพยาบาลผู้ป่วยนอก', units: [
        'งานการพยาบาลผู้ป่วยนอกบำบัดด้วยยา'
      ]},
      { id: 'g10', name: 'กลุ่มงานการพยาบาลผู้ป่วยใน', units: [
        'งานการพยาบาลผู้ป่วยในบำบัดด้วยยา'
      ]}
    ]
  },
  {
    id: 'm4',
    name: 'ภารกิจด้านการพัฒนาระบบสุขภาพ',
    groups: [
      { id: 'g11', name: 'กลุ่มงานประกันสุขภาพ', units: [] },
      { id: 'g12', name: 'กลุ่มงานดิจิทัลการแพทย์', units: [] },
      { id: 'g13', name: 'กลุ่มงานวิจัย ถ่ายทอดและสนับสนุนวิชาการ', units: [] },
      { id: 'g14', name: 'กลุ่มงานพัฒนาคุณภาพ', units: [] },
      { id: 'g15', name: 'กลุ่มงานพัฒนานโยบายและยุทธศาสตร์การแพทย์', units: [] }
    ]
  }
];

/* Helper: หาชื่อกลุ่มงานจาก id */
function getGroupName(groupId) {
  for (const m of MISSIONS) {
    const g = m.groups.find(x => x.id === groupId);
    if (g) return g.name;
  }
  return groupId || '';
}

/* Helper: หาชื่อภารกิจจาก id */
function getMissionName(missionId) {
  const m = MISSIONS.find(x => x.id === missionId);
  return m ? m.name : missionId || '';
}

/* Helper: หา groups ของ mission */
function getMissionGroups(missionId) {
  const m = MISSIONS.find(x => x.id === missionId);
  return m ? m.groups : [];
}

/* Helper: หา units ของกลุ่มงาน */
function getGroupUnits(groupId) {
  for (const m of MISSIONS) {
    const g = m.groups.find(x => x.id === groupId);
    if (g) return g.units || [];
  }
  return [];
}

/* Helper: หาทุกหน่วยงานย่อย (flatten) */
function getAllUnits() {
  const all = [];
  MISSIONS.forEach(m => {
    m.groups.forEach(g => {
      (g.units || []).forEach(u => {
        all.push({ unit: u, group: g.name, mission: m.name, groupId: g.id });
      });
    });
  });
  return all;
}
