/**
 * IT Stock — Icon Generator
 * สร้าง icon สำหรับ PWA (192x192 และ 512x512)
 */

const fs = require('fs');
const path = require('path');

// สร้าง SVG template
function createIconSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6"/>
      <stop offset="100%" style="stop-color:#1d4ed8"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="512" height="512" rx="100" fill="url(#bg)"/>
  
  <!-- Box icon with shadow -->
  <g transform="translate(256, 220)" fill="none" stroke="white" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadow)">
    <!-- Main box -->
    <path d="M-120,-60 L0,-120 L120,-60 L120,60 L0,120 L-120,60 Z" fill="rgba(255,255,255,0.1)"/>
    <!-- Top lines -->
    <line x1="0" y1="-120" x2="0" y2="0"/>
    <line x1="-120" y1="-60" x2="0" y2="0"/>
    <line x1="120" y1="-60" x2="0" y2="0"/>
    <!-- Side lines -->
    <line x1="-120" y1="-60" x2="-120" y2="60"/>
    <line x1="120" y1="-60" x2="120" y2="60"/>
    <line x1="0" y1="0" x2="0" y2="120"/>
  </g>
  
  <!-- Text IT Stock -->
  <text x="256" y="390" text-anchor="middle" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="80" font-weight="bold" letter-spacing="2">IT Stock</text>
</svg>`;
}

// บันทึก SVG files
const sizes = [192, 512];
const assetsDir = path.join(__dirname, '..', 'assets');

sizes.forEach(size => {
  const svg = createIconSVG(size);
  const filePath = path.join(assetsDir, `icon-${size}.svg`);
  fs.writeFileSync(filePath, svg);
  console.log(`Created: ${filePath}`);
});

console.log('\n✅ SVG icons created successfully!');
console.log('\n📌 วิธีแปลงเป็น PNG:');
console.log('1. เปิดไฟล์ SVG ในเบราว์เซอร์');
console.log('2. ใช้ tool แปลงเป็น PNG เช่น https://svgtopng.com');
console.log('3. หรือใช้ Inkscape: inkscape icon-512.svg -o icon.png -w 512 -h 512');
console.log('\n📌 วิธีใช้ชั่วคราว:');
console.log('SVG files สามารถใช้เป็น icon ได้เลยในเบราว์เซอร์ส่วนใหญ่');