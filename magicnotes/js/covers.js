// Couvertures de carnets génératives — formes géométriques uniquement.
export const COVER_PATTERNS = [
  { id: 'prism', label: 'Prisme' },
  { id: 'bauhaus', label: 'Bauhaus' },
  { id: 'waves', label: 'Ondes' },
  { id: 'arcs', label: 'Arcs' },
  { id: 'chevron', label: 'Chevrons' },
  { id: 'stripes', label: 'Rayures' },
  { id: 'dots', label: 'Trame' },
  { id: 'mono', label: 'Monogramme' },
];
export const COVER_HUES = [8, 24, 42, 92, 150, 172, 198, 222, 252, 285, 330, 210];

function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}
const hsl = (h, s, l, a = 1) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}% / ${a})`;

export function coverSVG(pattern, hue, name = '', seed = '') {
  const r = rng(pattern + hue + seed + name);
  const W = 300, H = 400;
  let b = '';
  const h = hue;
  switch (pattern) {
    case 'prism': {
      const s = 60, hh = s * 0.866;
      for (let y = 0; y * hh < H + hh; y++) for (let x = -1; x * s < W + s; x++) {
        const ox = (y % 2) * (s / 2), px = x * s + ox, py = y * hh;
        const t = y / (H / hh);
        const l1 = 62 + t * 26 + r() * 7, l2 = 66 + t * 26 + r() * 7;
        b += `<path d="M${px} ${py + hh}L${px + s / 2} ${py}L${px + s} ${py + hh}Z" fill="${hsl(h + x * 5 - t * 30, 70, Math.min(l1, 96))}"/>`;
        b += `<path d="M${px + s / 2} ${py}L${px + s} ${py + hh}L${px + s * 1.5} ${py}Z" fill="${hsl(h + x * 5 - t * 30 + 8, 72, Math.min(l2, 97))}"/>`;
      }
      break;
    }
    case 'bauhaus': {
      b += `<rect width="${W}" height="${H}" fill="${hsl(h, 30, 93)}"/>`;
      b += `<rect x="0" y="0" width="${W}" height="150" fill="${hsl(h + 180, 45, 26)}"/>`;
      b += `<circle cx="${W - 70}" cy="150" r="78" fill="${hsl(h, 80, 56)}"/>`;
      b += `<path d="M0 400V250a150 150 0 0 1 150 150z" fill="${hsl(h + 30, 85, 62)}"/>`;
      b += `<rect x="170" y="270" width="130" height="130" fill="${hsl(h + 180, 30, 18)}"/>`;
      b += `<path d="M170 270h130a130 130 0 0 1-130 130z" fill="${hsl(h, 35, 88)}"/>`;
      b += `<rect x="40" y="40" width="70" height="14" rx="7" fill="${hsl(h, 30, 93)}" opacity=".9"/>`;
      break;
    }
    case 'waves': {
      b += `<rect width="${W}" height="${H}" fill="${hsl(h, 55, 92)}"/>`;
      for (let i = 0; i < 8; i++) {
        const y0 = 70 + i * 45, a = 14 + r() * 18, f = 1 + r() * 1.4, ph = r() * 6;
        let d = `M0 ${H}L0 ${y0}`;
        for (let x = 0; x <= W; x += 10) d += `L${x} ${(y0 + Math.sin(x / W * Math.PI * 2 * f + ph) * a).toFixed(1)}`;
        d += `L${W} ${H}Z`;
        b += `<path d="${d}" fill="${hsl(h + i * 6, 60, 82 - i * 7)}"/>`;
      }
      break;
    }
    case 'arcs': {
      b += `<rect width="${W}" height="${H}" fill="${hsl(h, 30, 14)}"/>`;
      for (let i = 16; i > 0; i--) b += `<circle cx="0" cy="${H}" r="${i * 26}" fill="none" stroke="${i % 2 ? hsl(h, 75, 60) : hsl(h + 35, 80, 72)}" stroke-width="9" opacity="${0.35 + (i / 16) * 0.6}"/>`;
      b += `<circle cx="${W - 60}" cy="80" r="28" fill="${hsl(h + 35, 85, 70)}"/>`;
      break;
    }
    case 'chevron': {
      b += `<rect width="${W}" height="${H}" fill="${hsl(h, 35, 14)}"/>`;
      for (let i = -6; i < 14; i++) {
        const y = i * 38;
        b += `<path d="M-20 ${y + 60}L75 ${y}L150 ${y + 60}L225 ${y}L320 ${y + 60}" fill="none" stroke="${hsl(h + 25, 50, 86)}" stroke-width="15" stroke-linejoin="miter"/>`;
      }
      break;
    }
    case 'stripes': {
      b += `<rect width="${W}" height="${H}" fill="${hsl(h, 40, 94)}"/>`;
      const cols = [hsl(h, 75, 55), hsl(h + 30, 80, 66), hsl(h + 180, 45, 30), hsl(h, 40, 94)];
      b += `<g transform="rotate(-32 150 200)">`;
      for (let i = -12; i < 22; i++) b += `<rect x="-200" y="${i * 34}" width="700" height="${10 + (((i % 3) + 3) % 3) * 7}" fill="${cols[(i + 12) % cols.length]}"/>`;
      b += `</g>`;
      break;
    }
    case 'dots': {
      b += `<rect width="${W}" height="${H}" fill="${hsl(h, 45, 90)}"/>`;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 12; x++) {
        const cx = 14 + x * 25, cy = 14 + y * 25, d = Math.hypot(cx - 210, cy - 250);
        const rr = Math.max(1.2, 10 - d / 26);
        b += `<circle cx="${cx}" cy="${cy}" r="${rr.toFixed(1)}" fill="${hsl(h, 55, 40)}"/>`;
      }
      break;
    }
    default: { // mono
      const gid = 'g' + Math.floor(r() * 1e8);
      b += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(h, 70, 62)}"/><stop offset="1" stop-color="${hsl(h + 40, 60, 30)}"/></linearGradient></defs>`;
      b += `<rect width="${W}" height="${H}" fill="url(#${gid})"/>`;
      const L = (name.trim()[0] || 'M').toUpperCase().replace(/[<>&"]/g, '');
      b += `<text x="40" y="350" font-family="-apple-system,Inter,sans-serif" font-weight="800" font-size="230" fill="#fff" opacity=".22">${L}</text>`;
      b += `<rect x="40" y="44" width="54" height="5" rx="2.5" fill="#fff" opacity=".8"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${b}</svg>`;
}
