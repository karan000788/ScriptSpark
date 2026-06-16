import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', 'public', 'templates');

const TYPES = {
  'Dark Mystery': { bg: ['#1a0a2e', '#0d0415'], accent: '#FF0000' },
  'True Crime':   { bg: ['#1a0a1a', '#0d000d'], accent: '#FF4444' },
  'Finance':      { bg: ['#0a2e1a', '#051a0f'], accent: '#00FF88' },
  'Gaming':       { bg: ['#0a0a2e', '#050515'], accent: '#00FFFF' },
  'Motivation':   { bg: ['#2e1a0a', '#1a0f05'], accent: '#FFD700' },
  'Education':    { bg: ['#0a1a2e', '#050f1a'], accent: '#4A90E2' },
  'History':      { bg: ['#2e1a0a', '#1a0f05'], accent: '#C9A84C' },
  'Tech':         { bg: ['#0a0a1a', '#050510'], accent: '#00CFFF' },
  'Technology':   { bg: ['#0a0a1a', '#050510'], accent: '#00CFFF' },
  'Health':       { bg: ['#0a2e0a', '#051a05'], accent: '#7ED321' },
  'Food':         { bg: ['#2e1a0a', '#1a0f05'], accent: '#FF6B35' },
  'Travel':       { bg: ['#1a2e2e', '#0f1a1a'], accent: '#F5A623' },
  'Relationships':{ bg: ['#2e0a1a', '#1a050f'], accent: '#FF6B9D' },
  'Business':     { bg: ['#1a1a2e', '#0f0f1a'], accent: '#FFFFFF' },
  'Mythology':    { bg: ['#1a0a2e', '#0d0415'], accent: '#9B59B6' },
  'Astrology':    { bg: ['#0a0a2e', '#050515'], accent: '#C39BD3' },
  'General':      { bg: ['#1a1a2e', '#0f0f1a'], accent: '#FFFFFF' },
  'Default':      { bg: ['#1a1a2e', '#0f0f1a'], accent: '#FFFFFF' }
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2), 16), parseInt(h.slice(2,4), 16), parseInt(h.slice(4,6), 16)];
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeB, data, crcB]);
}

function generateGradientPNG(width, height, c1, c2) {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);

  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(rowLen * height);

  for (let y = 0; y < height; y++) {
    const t = height > 1 ? y / (height - 1) : 0;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    const off = y * rowLen;
    raw[off] = 0;
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 3;
      raw[p] = r;
      raw[p+1] = g;
      raw[p+2] = b;
    }
  }

  const deflated = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', deflated),
    createPngChunk('IEND', Buffer.alloc(0))
  ]);
}

export function ensureTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }

  for (const [name, colors] of Object.entries(TYPES)) {
    const filePath = path.join(TEMPLATES_DIR, `${name.toLowerCase().replace(/\s+/g, '_')}_base.png`);
    if (!fs.existsSync(filePath)) {
      const [c1, c2] = colors.bg;
      const png = generateGradientPNG(1280, 720, c1, c2);
      fs.writeFileSync(filePath, png);
      console.log(`Created template: ${filePath}`);
    }
  }

  const defaultPath = path.join(TEMPLATES_DIR, 'default_safe.png');
  if (!fs.existsSync(defaultPath)) {
    const png = generateGradientPNG(1280, 720, '#1a1a2e', '#0f0f1a');
    fs.writeFileSync(defaultPath, png);
    console.log(`Created template: ${defaultPath}`);
  }
}

export function getTemplatePath(niche) {
  const name = (niche || 'default').toLowerCase().replace(/\s+/g, '_');
  const specific = path.join(TEMPLATES_DIR, `${name}_base.png`);
  if (fs.existsSync(specific)) return specific;
  return path.join(TEMPLATES_DIR, 'default_safe.png');
}

export function getTemplatePublicUrl(niche) {
  const name = (niche || 'default').toLowerCase().replace(/\s+/g, '_');
  const specific = `/public/templates/${name}_base.png`;
  const defaultUrl = '/public/templates/default_safe.png';
  const onDisk = path.join(TEMPLATES_DIR, `${name}_base.png`);
  if (fs.existsSync(onDisk)) return specific;
  return defaultUrl;
}
