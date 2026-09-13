/* gen-icon.js — 纯 node 生成 PNG 应用图标（无依赖）
   生成：icons/icon-512.png / icon-192.png / apple-touch-icon.png（深底 + 紫圆 + 白色小火箭） */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* —— PNG 编码 —— */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function pngEncode(w, h, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    pixels.copy ? pixels.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4)
                : raw.set(pixels.subarray(y * w * 4, (y + 1) * w * 4), y * stride + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* —— 绘制 —— */
const C = {
  bg: [23, 27, 41], bgEdge: [13, 16, 24],
  circleTop: [157, 133, 255], circleBot: [106, 72, 240],
  rocket: [244, 245, 250], window: [23, 27, 41],
  fin: [255, 138, 77], flame: [255, 201, 77],
};
const inPoly = (px, py, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inCircle = (px, py, cx, cy, r) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
const rot = (x, y, ang) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];

// 火箭局部坐标（y 向上），整体旋转 -45°（指向右上）
const ANG = -Math.PI / 4;
const ROCKET_POLY = [[-0.09, -0.06], [-0.09, 0.08], [-0.05, 0.17], [0, 0.22], [0.05, 0.17], [0.09, 0.08], [0.09, -0.06]].map(([x, y]) => rot(x, y, ANG));
const FIN_L = [[-0.09, -0.02], [-0.18, -0.15], [-0.09, -0.15]].map(([x, y]) => rot(x, y, ANG));
const FIN_R = [[0.09, -0.02], [0.09, -0.15], [0.18, -0.15]].map(([x, y]) => rot(x, y, ANG));
const FLAME = [[-0.045, -0.06], [0, -0.19], [0.045, -0.06]].map(([x, y]) => rot(x, y, ANG));
const WIN_C = rot(0, 0.03, ANG), WIN_R = 0.052;

function drawPixel(nx, ny) {
  // 背景：圆角矩形
  const b = 0.5, r = 0.18;
  const dx = Math.max(Math.abs(nx) - (b - r), 0), dy = Math.max(Math.abs(ny) - (b - r), 0);
  const corner = dx * dx + dy * dy > r * r;
  if (corner) return [0, 0, 0, 0];
  const edge = dx * dx + dy * dy > (r - 0.015) * (r - 0.015);
  if (edge) return [...C.bgEdge, 255];
  // 紫色渐变圆
  if (inCircle(nx, ny, 0, 0, 0.4)) {
    const t = (ny + 0.4) / 0.8;
    const mix = C.circleTop.map((c, i) => Math.round(c + (C.circleBot[i] - c) * t));
    // 火箭各部件
    if (inPoly(nx, ny, FIN_L) || inPoly(nx, ny, FIN_R)) return [...C.fin, 255];
    if (inPoly(nx, ny, FLAME)) return [...C.flame, 255];
    if (inPoly(nx, ny, ROCKET_POLY)) {
      if (inCircle(nx, ny, WIN_C[0], WIN_C[1], WIN_R)) return [...C.window, 255];
      return [...C.rocket, 255];
    }
    return [...mix, 255];
  }
  return [...C.bg, 255];
}

function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 3; // 3x3 超采样抗锯齿
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const nx = ((x + (sx + 0.5) / SS) / size) - 0.5;
        const ny = 0.5 - (y + (sy + 0.5) / SS) / size;
        const [pr, pg, pb, pa] = drawPixel(nx, ny);
        r += pr; g += pg; b += pb; a += pa;
      }
      const n = SS * SS, i = (y * size + x) * 4;
      px[i] = Math.round(r / n); px[i + 1] = Math.round(g / n); px[i + 2] = Math.round(b / n); px[i + 3] = Math.round(a / n);
    }
  }
  return pngEncode(size, size, px);
}

const outDir = path.join(__dirname, 'icons');
fs.mkdirSync(outDir, { recursive: true });
[[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png']].forEach(([size, name]) => {
  fs.writeFileSync(path.join(outDir, name), renderIcon(size));
  console.log('生成 icons/' + name);
});
