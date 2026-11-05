// Atelier de dessin plein écran — vectoriel (traits ré-éditables), pression du stylet, gomme.
import { icon } from './icons.js';
import { ask } from './ask.js';

const COLORS = ['#16171B', '#5B5E66', '#D93A3A', '#E8892B', '#2E9E6A', '#2F6FE0', '#6C4FD8', '#FFFFFF'];
const BGS = ['plain', 'grid', 'dots', 'lines'];
const BG_LABEL = { plain: 'Uni', grid: 'Quadrillé', dots: 'Pointillé', lines: 'Ligné' };
const PAPER = '#FFFDF8';

function drawBg(ctx, bg, w, h) {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);
  const step = w / 22;
  ctx.save();
  if (bg === 'grid' || bg === 'lines') {
    ctx.strokeStyle = 'rgba(40,60,120,.12)'; ctx.lineWidth = Math.max(1, w / 900);
    ctx.beginPath();
    for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    if (bg === 'grid') for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    ctx.stroke();
  } else if (bg === 'dots') {
    ctx.fillStyle = 'rgba(40,60,120,.22)';
    for (let y = step; y < h; y += step) for (let x = step; x < w; x += step) { ctx.beginPath(); ctx.arc(x, y, Math.max(1, w / 700), 0, 7); ctx.fill(); }
  }
  ctx.restore();
}

// Les points sont normalisés par la largeur → indépendants de la taille d'écran.
function strokePath(ctx, s, W) {
  const pts = s.points; if (!pts.length) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
  const base = s.size * W / 400;
  if (s.tool === 'pen') {
    if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0] * W, pts[0][1] * W, base * (0.4 + pts[0][2] * 0.9) / 2, 0, 7); ctx.fill(); }
    for (let i = 1; i < pts.length; i++) segment(ctx, pts, i, W, base);
  } else {
    ctx.globalAlpha = s.tool === 'marker' ? 0.38 : 1;
    ctx.lineWidth = s.tool === 'marker' ? base * 3.2 : base * 4;
    ctx.beginPath(); ctx.moveTo(pts[0][0] * W, pts[0][1] * W);
    if (pts.length === 1) ctx.lineTo(pts[0][0] * W + 0.1, pts[0][1] * W);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2 * W, my = (pts[i][1] + pts[i + 1][1]) / 2 * W;
      ctx.quadraticCurveTo(pts[i][0] * W, pts[i][1] * W, mx, my);
    }
    if (pts.length > 1) { const l = pts[pts.length - 1]; ctx.lineTo(l[0] * W, l[1] * W); }
    ctx.stroke();
  }
  ctx.restore();
}
function segment(ctx, pts, i, W, base) {
  const a = pts[i - 1], b = pts[i], c = pts[i - 2] || a;
  const w = base * (0.35 + b[2] * 0.95);
  ctx.lineWidth = w;
  ctx.beginPath();
  const sx = (c[0] + a[0]) / 2 * W, sy = (c[1] + a[1]) / 2 * W;
  const ex = (a[0] + b[0]) / 2 * W, ey = (a[1] + b[1]) / 2 * W;
  ctx.moveTo(i === 1 ? a[0] * W : sx, i === 1 ? a[1] * W : sy);
  ctx.quadraticCurveTo(a[0] * W, a[1] * W, ex, ey);
  if (i === pts.length - 1) ctx.lineTo(b[0] * W, b[1] * W);
  ctx.stroke();
}

export async function renderDrawing({ strokes, bg, aspect }, width = 1600, type = 'image/png', quality) {
  const W = width, H = Math.round(width * aspect);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  drawBg(ctx, bg, W, H);
  const ink = document.createElement('canvas'); ink.width = W; ink.height = H;
  const ictx = ink.getContext('2d');
  strokes.forEach((s) => strokePath(ictx, s, W));
  ctx.drawImage(ink, 0, 0);
  return new Promise((r) => c.toBlob(r, type, quality));
}

export function openDrawing(init = {}) {
  return new Promise((resolve) => {
    let strokes = (init.strokes || []).map((s) => ({ ...s, points: s.points.slice() }));
    let redo = [];
    let bg = init.bg || 'plain';
    let tool = 'pen', color = COLORS[0], size = 3;
    let penSeen = false;
    const root = document.createElement('div');
    root.className = 'draw';
    root.innerHTML = `
      <header class="draw-top">
        <button class="btn btn-ghost" data-d="cancel">Annuler</button>
        <div class="draw-hist">
          <button class="ibtn" data-d="undo" aria-label="Annuler le trait">${icon('undo')}</button>
          <button class="ibtn" data-d="redo" aria-label="Rétablir">${icon('redo')}</button>
        </div>
        <button class="btn btn-primary" data-d="save">Enregistrer</button>
      </header>
      <div class="draw-stage"><div class="draw-paper bg-${bg}"><canvas class="c-base"></canvas><canvas class="c-live"></canvas></div></div>
      <footer class="draw-tools">
        <div class="draw-row">
          <button class="tool on" data-tool="pen">${icon('pen')}<span>Stylo</span></button>
          <button class="tool" data-tool="marker">${icon('marker')}<span>Feutre</span></button>
          <button class="tool" data-tool="eraser">${icon('eraser')}<span>Gomme</span></button>
          <button class="tool" data-d="bg">${icon('grid')}<span class="bg-label">${BG_LABEL[bg]}</span></button>
          <button class="tool" data-d="clear">${icon('trash')}<span>Effacer</span></button>
        </div>
        <div class="draw-row draw-row2">
          <div class="swatches">${COLORS.map((c, i) => `<button class="sw ${i === 0 ? 'on' : ''}" data-color="${c}" style="--sw:${c}" aria-label="Couleur"></button>`).join('')}</div>
          <div class="size-wrap"><span class="size-dot"></span><input class="size" type="range" min="1" max="16" step="0.5" value="3" aria-label="Épaisseur"></div>
        </div>
      </footer>`;
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('open'));

    const paper = root.querySelector('.draw-paper');
    const base = root.querySelector('.c-base'), live = root.querySelector('.c-live');
    const bctx = base.getContext('2d'), lctx = live.getContext('2d');
    let W = 0, Hh = 0, dpr = 1;
    const aspect = init.aspect || null;
    let curAspect = aspect;

    function layout() {
      const st = root.querySelector('.draw-stage');
      let w = st.clientWidth - 24, h = st.clientHeight - 24;
      if (curAspect) { if (w * curAspect > h) w = h / curAspect; else h = w * curAspect; }
      else curAspect = h / w;
      W = w; Hh = w * curAspect; dpr = Math.min(window.devicePixelRatio || 1, 3);
      paper.style.width = W + 'px'; paper.style.height = Hh + 'px';
      for (const c of [base, live]) { c.width = Math.round(W * dpr); c.height = Math.round(Hh * dpr); c.style.width = W + 'px'; c.style.height = Hh + 'px'; }
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0); lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }
    function redraw() {
      bctx.clearRect(0, 0, W, Hh);
      strokes.forEach((s) => strokePath(bctx, s, W));
      updateHist();
    }
    function updateHist() {
      root.querySelector('[data-d=undo]').disabled = !strokes.length;
      root.querySelector('[data-d=redo]').disabled = !redo.length;
    }
    const sizeDot = root.querySelector('.size-dot');
    function updateDot() { const px = Math.max(4, size * (tool === 'pen' ? 1.6 : 3.2)); sizeDot.style.width = sizeDot.style.height = Math.min(px, 34) + 'px'; sizeDot.style.background = tool === 'eraser' ? 'transparent' : color; }
    updateDot();

    let cur = null, pid = null;
    function pt(e) {
      const r = paper.getBoundingClientRect();
      const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.55;
      return [(e.clientX - r.left) / W, (e.clientY - r.top) / W, p];
    }
    live.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') penSeen = true;
      if (penSeen && e.pointerType === 'touch') return; // rejet de la paume
      if (cur) return;
      e.preventDefault();
      live.setPointerCapture(e.pointerId); pid = e.pointerId;
      cur = { tool, color: tool === 'eraser' ? '#000' : color, size, points: [pt(e)] };
      if (tool === 'pen') strokePath(bctx, cur, W);
    });
    live.addEventListener('pointermove', (e) => {
      if (!cur || e.pointerId !== pid) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        cur.points.push(pt(ev));
        if (cur.tool === 'pen') {
          bctx.save(); bctx.lineCap = 'round'; bctx.lineJoin = 'round'; bctx.strokeStyle = cur.color;
          segment(bctx, cur.points, cur.points.length - 1, W, cur.size * W / 400); bctx.restore();
        }
      }
      if (cur.tool === 'eraser') { bctx.save(); strokePath(bctx, { ...cur, points: cur.points.slice(-3) }, W); bctx.restore(); }
      else if (cur.tool === 'marker') { lctx.clearRect(0, 0, W, Hh); strokePath(lctx, cur, W); }
    });
    const end = (e) => {
      if (!cur || e.pointerId !== pid) return;
      strokes.push(cur); redo = []; cur = null; pid = null;
      lctx.clearRect(0, 0, W, Hh);
      redraw();
    };
    live.addEventListener('pointerup', end);
    live.addEventListener('pointercancel', end);

    function close(result) {
      root.classList.remove('open');
      window.removeEventListener('resize', layout);
      setTimeout(() => root.remove(), 320);
      resolve(result);
    }

    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.tool) {
        tool = t.dataset.tool;
        root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b === t));
        updateDot();
      } else if (t.dataset.color) {
        color = t.dataset.color; if (tool === 'eraser') { tool = 'pen'; root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === 'pen')); }
        root.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b === t));
        updateDot();
      } else switch (t.dataset.d) {
        case 'undo': if (strokes.length) { redo.push(strokes.pop()); redraw(); } break;
        case 'redo': if (redo.length) { strokes.push(redo.pop()); redraw(); } break;
        case 'clear': if (strokes.length && await ask('Effacer tout le dessin ?', 'Effacer')) { redo = []; strokes = []; redraw(); } break;
        case 'bg': {
          bg = BGS[(BGS.indexOf(bg) + 1) % BGS.length];
          paper.className = 'draw-paper bg-' + bg;
          root.querySelector('.bg-label').textContent = BG_LABEL[bg];
          break;
        }
        case 'cancel':
          if (strokes.length && JSON.stringify(strokes) !== JSON.stringify(init.strokes || []) && !(await ask('Quitter sans enregistrer le dessin ?', 'Quitter'))) return;
          close(null); break;
        case 'save': {
          if (!strokes.length) { close(null); return; }
          t.disabled = true;
          const data = { strokes, bg, aspect: curAspect };
          const blob = await renderDrawing(data, 1600);
          const thumb = await renderDrawing(data, 520, 'image/jpeg', 0.85);
          close({ ...data, blob, thumb });
          break;
        }
      }
    });
    root.querySelector('.size').addEventListener('input', (e) => { size = +e.target.value; updateDot(); });
    window.addEventListener('resize', layout);
    requestAnimationFrame(layout);
  });
}
