// MagicNotes — carnet de création pour créateurs de tours.
import { icon } from './icons.js';
import { db, initStorage, storageMode, downloadsApi } from './db.js';
import { coverSVG, COVER_PATTERNS, COVER_HUES } from './covers.js';
import { openDrawing } from './draw.js';
import { openRecorder, canRecord, framed } from './recorder.js';

/* ───────────────────────── Utilitaires ───────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
function relTime(ts) {
  const d = (ts - Date.now()) / 1000, a = Math.abs(d);
  if (a < 45) return 'à l’instant';
  if (a < 3600) return rtf.format(Math.round(d / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
  if (a < 86400 * 7) return rtf.format(Math.round(d / 86400), 'day');
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(ts);
}
const fullDate = (ts) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(ts);
const fmtDur = (s) => { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtSize = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' Go' : b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : Math.max(1, Math.round(b / 1e3)) + ' Ko';
const plural = (n, s, p) => `${n} ${n > 1 ? (p || s + 's') : s}`;

/* ───────────────────────── Constantes métier ───────────────────────── */
export const STATUSES = [
  { id: 'idee', short: 'Idées', label: 'Idée brute', desc: 'Une intuition à noter avant qu’elle ne s’envole.' },
  { id: 'dev', short: 'En dév.', label: 'En développement', desc: 'Méthode et construction en cours.' },
  { id: 'test', short: 'En test', label: 'En test', desc: 'Essais devant des spectateurs, ajustements.' },
  { id: 'pret', short: 'Prêts', label: 'Prêt', desc: 'Rodé, prêt à être présenté.' },
  { id: 'rep', short: 'Répertoire', label: 'Au répertoire', desc: 'Intégré à vos spectacles.' },
];
const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];
const HUE_PRESETS = [
  { name: 'Ambre', hue: 42, sat: 90 }, { name: 'Corail', hue: 12, sat: 82 }, { name: 'Framboise', hue: 340, sat: 70 },
  { name: 'Iris', hue: 262, sat: 62 }, { name: 'Indigo', hue: 228, sat: 66 }, { name: 'Océan', hue: 202, sat: 75 },
  { name: 'Lagon', hue: 170, sat: 55 }, { name: 'Sauge', hue: 128, sat: 38 }, { name: 'Olive', hue: 70, sat: 50 },
  { name: 'Ardoise', hue: 215, sat: 14 },
];
const FICHE = [
  { k: 'effet', label: 'Effet', ph: 'Ce que vit le spectateur, du début à la fin…' },
  { k: 'methode', label: 'Méthode', ph: 'Le secret : principe, manipulations, préparation…', secret: true },
  { k: 'materiel', label: 'Matériel', ph: 'Accessoires, gimmicks, jeu de cartes…' },
  { k: 'preparation', label: 'Mise en place', ph: 'Avant d’entrer en scène…' },
  { k: 'credits', label: 'Crédits & sources', ph: 'Inspirations, auteurs, livres, vidéos…' },
];
const emptyFiche = () => ({ effet: '', methode: '', materiel: '', preparation: '', credits: '', duree: '', difficulte: 0 });
const TEMPLATES = [
  { id: 'fiche', label: 'Fiche tour', desc: 'Effet, méthode, matériel, crédits', icon: 'sheet', theme: 't-tours', fiche: true },
  { id: 'method', label: 'Idée de méthode', desc: 'Principe et applications', icon: 'bolt', theme: 't-methodes', html: '<h2>Principe</h2><p><br></p><h2>Applications possibles</h2><ul><li><br></li></ul>' },
  { id: 'routine', label: 'Routine & script', desc: 'Structure en phases et texte', icon: 'layers', theme: 't-routines', html: '<h2>Intention</h2><p><br></p><h2>Ouverture</h2><p><br></p><h2>Déroulé</h2><ol><li><br></li></ol><h2>Final</h2><p><br></p><h2>Script</h2><blockquote><br></blockquote>' },
  { id: 'show', label: 'Compte rendu de spectacle', desc: 'Lieu, public, retours à chaud', icon: 'calendar', theme: 't-shows', html: '<p><b>Lieu :</b> </p><p><b>Date :</b> </p><p><b>Public :</b> </p><h2>Ce qui a fonctionné</h2><ul><li><br></li></ul><h2>À améliorer</h2><ul class="cl"><li data-c="0"><br></li></ul>' },
  { id: 'lecture', label: 'Notes de lecture', desc: 'Livre, conférence, vidéo', icon: 'book', html: '<p><b>Source :</b> </p><p><b>Auteur :</b> </p><h2>Points clés</h2><ul><li><br></li></ul><h2>Idées à creuser</h2><ul class="cl"><li data-c="0"><br></li></ul>' },
];
const CAPTURES = [
  { k: 'write', label: 'Note', icon: 'write', c: 'var(--ink)' },
  { k: 'list', label: 'Liste', icon: 'checklist', c: '#2E9E6A' },
  { k: 'audio', label: 'Vocal', icon: 'mic', c: '#E5484D' },
  { k: 'photo', label: 'Photo', icon: 'camera', c: '#2F6FE0' },
  { k: 'video', label: 'Vidéo', icon: 'video', c: '#0E9AA7' },
  { k: 'draw', label: 'Dessin', icon: 'scribble', c: '#6C4FD8' },
  { k: 'file', label: 'Fichier', icon: 'clip', c: '#8A8F98' },
  { k: 'fiche', label: 'Fiche tour', icon: 'sheet', c: '#D98E04' },
];

/* ───────────────────────── État ───────────────────────── */
const SETTINGS_DEFAULT = { mode: 'auto', fontSize: 'm', hideMethods: true, layout: 'grid', recent: [], sort: 'updated' };
const S = {
  notes: [], books: [], themes: [], settings: { ...SETTINGS_DEFAULT },
  key: null, last: 'home', scroll: {}, editor: null,
  bookFilter: {}, search: { q: '', theme: null, sub: null, book: null, types: new Set(), status: null },
  atelierTheme: null, pushedNote: false, depth: 0,
};
const live = () => S.notes.filter((n) => !n.deleted);
const bookOf = (n) => S.books.find((b) => b.id === n.bookId);
const themeById = (id) => S.themes.find((t) => t.id === id);
const themeOf = (n) => themeById(n.themeId);
const subIdx = (t, subId) => (t ? t.subs.findIndex((s) => s.id === subId) : -1);
const saveSettings = () => db.put('meta', { id: 'settings', value: S.settings });
const byUpd = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

async function load() {
  const [notes, books, themes, meta] = await Promise.all([db.all('notes'), db.all('books'), db.all('themes'), db.get('meta', 'settings')]);
  Object.assign(S, { notes, books, themes });
  S.settings = { ...SETTINGS_DEFAULT, ...(meta?.value || {}) };
  if (!books.length && !themes.length) await seed();
  S.books.sort((a, b) => a.order - b.order);
  S.themes.sort((a, b) => a.order - b.order);
  // Corbeille : purge après 30 jours
  const lim = Date.now() - 30 * 864e5;
  for (const n of S.notes.filter((n) => n.deleted && n.deleted < lim)) await hardDelete(n);
}

async function seed() {
  const sub = (name) => ({ id: uid(), name });
  const themes = [
    { id: 't-tours', name: 'Idées de tours', hue: 42, sat: 90, subs: ['Cartomagie', 'Pièces', 'Mentalisme', 'Close-up', 'Scène', 'Objets'].map(sub) },
    { id: 't-methodes', name: 'Méthodes', hue: 170, sat: 55, subs: ['Gimmicks', 'Manipulations', 'Psychologie', 'Index & charges'].map(sub) },
    { id: 't-tech', name: 'Applications & tech', hue: 128, sat: 38, subs: ['Apps', 'Électronique', 'Impression'].map(sub) },
    { id: 't-routines', name: 'Routines & scripts', hue: 262, sat: 62, subs: ['Présentations', 'Textes', 'Gags'].map(sub) },
    { id: 't-shows', name: 'Spectacles & business', hue: 12, sat: 82, subs: ['Conférences', 'Clients', 'Logistique'].map(sub) },
  ].map((t, i) => ({ ...t, order: i }));
  const books = [
    { id: 'b-idees', name: 'Idées', pattern: 'prism', hue: 330 },
    { id: 'b-projets', name: 'Projets en cours', pattern: 'arcs', hue: 210 },
    { id: 'b-conf', name: 'Conférence', pattern: 'bauhaus', hue: 30 },
    { id: 'b-biblio', name: 'Bibliothèque', pattern: 'chevron', hue: 40 },
  ].map((b, i) => ({ ...b, order: i, createdAt: Date.now() }));
  const T = Object.fromEntries(themes.map((t) => [t.id, t]));
  const s = (tid, name) => T[tid].subs.find((x) => x.name === name)?.id || null;
  const now = Date.now();
  const mk = (o, i) => ({ id: uid(), bookId: 'b-idees', themeId: null, subId: null, title: '', html: '', text: '', tags: [], status: 'idee', pinned: false, fiche: null, media: [], createdAt: now - i * 36e5 * 7, updatedAt: now - i * 36e5 * 7, ...o });
  const p = (txt) => txt.split('\n').map((l) => `<p>${esc(l) || '<br>'}</p>`).join('');
  const notesRaw = [
    { title: 'Bienvenue dans MagicNotes', pinned: true, bookId: 'b-idees', html: '<p>Votre carnet de création. Quelques repères pour démarrer :</p><ul class="cl"><li data-c="1">Classez chaque note par <b>thème</b> (une couleur) et <b>sous-catégorie</b> (une nuance de cette couleur).</li><li data-c="0">Ajoutez photos, vidéos, dessins, vocaux et fichiers depuis la barre d’outils.</li><li data-c="0">Structurez un tour avec la <b>fiche technique</b> : effet, méthode, matériel, crédits.</li><li data-c="0">Suivez l’avancement de vos créations dans l’<b>Atelier</b>.</li><li data-c="0">Retrouvez tout avec la <b>recherche</b>, y compris le texte des vocaux transcrits.</li></ul><p>Astuce : écrivez <b>#motclé</b> dans une note pour créer un tag automatiquement.</p>' },
    { title: 'Index 52 cartes', themeId: 't-methodes', subId: s('t-methodes', 'Index & charges'), html: p('Index pour récupérer 52 cartes. Le long de la veste, de chacun des deux côtés. 26 de chaque.') },
    { title: 'Mini souffleur', themeId: 't-methodes', subId: s('t-methodes', 'Gimmicks'), status: 'dev', html: p('Pour faire bouger un petit objet (paille, billet, mouchoir…).\nMini souffleur dans la manche avec une toute petite sortie.') },
    { title: 'Voodoo chapelet', themeId: 't-tours', subId: s('t-tours', 'Objets'), html: p('Sur le principe de Voodoo Doll, faire la même chose avec un chapelet.\nPlus de sens, transportable.') },
    { title: 'Jeu imprimé USPCC', themeId: 't-tours', subId: s('t-tours', 'Cartomagie'), status: 'test', html: p('Dans un jeu spécialement imprimé par la USPCC en Maiden, associer 26 cartes pub avec 26 cartes index manquant.') },
    { title: 'Post-it à trois spectateurs', themeId: 't-tours', subId: s('t-tours', 'Mentalisme'), html: p('Un bloc de post-it est donné à 3 spectateurs.\nLe spectateur 1 écrit quelque chose sur le premier post-it, l’arrache, le roule en boule.') },
    { title: 'D’où vient le spectateur', themeId: 't-tours', subId: s('t-tours', 'Mentalisme'), status: 'pret', html: p('Le spectateur dit d’où il vient : « Fronton ».\nC’est où ça ? « 31 ».\nOn regarde la batterie… #impromptu') },
    { title: 'Application « 100e singe »', themeId: 't-tech', subId: s('t-tech', 'Apps'), html: p('Application pour de la réalité type « le 100ème singe ».\nPeut-être pas une app, mais plutôt un site.') },
  ];
  const notes = notesRaw.map(mk).map((n) => { n.text = htmlToText(n.html); n.autoTags = hashtags(n.text); return n; });
  await db.putMany('themes', themes); await db.putMany('books', books); await db.putMany('notes', notes);
  Object.assign(S, { themes, books, notes });
}

/* ───────────────────────── Couleurs ───────────────────────── */
const isDark = () => document.documentElement.dataset.mode === 'dark';
function tone(t, i = -1) {
  const dark = isDark();
  if (!t) return dark ? { bg: '#1C1D22', fg: '#ECECEF', dot: '#8E9098', sub: '#9A9CA3' } : { bg: '#FFFFFF', fg: '#16171B', dot: '#B9BBC1', sub: '#6B6E76' };
  const s = t.sat ?? 70;
  const k = i < 0 ? -1 : i % 6;
  const h = (t.hue + (k < 0 ? 0 : (2.5 - k) * 3) + 360) % 360;
  if (dark) {
    const L = k < 0 ? 24 : 32 - k * 2.6;
    return { bg: `hsl(${h} ${Math.round(s * 0.42)}% ${L}%)`, fg: `hsl(${h} ${Math.min(s, 55)}% 93%)`, dot: `hsl(${h} ${s}% 64%)`, sub: `hsl(${h} ${Math.round(s * 0.4)}% 76%)` };
  }
  const L = k < 0 ? 79 : 89 - k * 3.9;
  const ss = Math.round(k < 0 ? s * 0.85 : Math.min(96, s * (0.72 + k * 0.06)));
  return { bg: `hsl(${h} ${ss}% ${L}%)`, fg: `hsl(${h} 35% 12%)`, dot: `hsl(${h} ${s}% 42%)`, sub: `hsl(${h} 25% 30%)` };
}
const strong = (t) => (t ? `hsl(${t.hue} ${t.sat}% ${isDark() ? 62 : 48}%)` : 'var(--ink-4)');
function noteTone(n) { const t = themeOf(n); return tone(t, subIdx(t, n.subId)); }
const toneVars = (c) => `--c-bg:${c.bg};--c-fg:${c.fg};--c-dot:${c.dot};--c-sub:${c.sub}`;

/* ───────────────────────── Notes & médias ───────────────────────── */
function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = html.replace(/<\/(p|div|li|h\d|blockquote)>/gi, '</$1>\n').replace(/<br\s*\/?>/gi, '\n');
  return d.textContent.replace(/\n{3,}/g, '\n\n').trim();
}
const hashtags = (text) => [...new Set([...(text || '').matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{2,})/gu)].map((m) => m[1].toLowerCase()))];
const allTags = (n) => [...new Set([...(n.tags || []), ...(n.autoTags || [])])];
const isEmpty = (n) => !n.title.trim() && !n.text.trim() && !(n.media || []).length && !(n.fiche && Object.values(n.fiche).some((v) => v && v !== 0));
const isVisual = (m) => m.type === 'image' || m.type === 'drawing' || m.type === 'video';

function newNote(o = {}) {
  const now = Date.now();
  const n = { id: uid(), bookId: S.books[0]?.id || null, themeId: null, subId: null, title: '', html: '', text: '', tags: [], autoTags: [], status: 'idee', pinned: false, fiche: null, media: [], createdAt: now, updatedAt: now, ...o };
  if (n.html && !n.text) n.text = htmlToText(n.html);
  S.notes.push(n);
  db.put('notes', n);
  return n;
}
async function saveNote(n, touch = true) {
  if (touch) n.updatedAt = Date.now();
  n.autoTags = hashtags(n.text);
  await db.put('notes', n);
}
async function hardDelete(n) {
  for (const m of n.media || []) { await db.del('media', m.id); revokeMedia(m.id); }
  await db.del('notes', n.id);
  S.notes = S.notes.filter((x) => x.id !== n.id);
}
async function trashNote(n) {
  n.deleted = Date.now(); await saveNote(n, false);
  toast('Note placée dans la corbeille', { label: 'Annuler', fn: async () => { delete n.deleted; await saveNote(n, false); refresh(); } });
}
async function duplicateNote(n) {
  const c = newNote({ ...structuredClone({ ...n, media: [] }), id: uid(), title: n.title ? n.title + ' (copie)' : '', pinned: false, createdAt: Date.now(), updatedAt: Date.now() });
  for (const m of n.media || []) {
    const rec = await db.get('media', m.id); if (!rec) continue;
    const id = uid(); await db.put('media', { ...rec, id, noteId: c.id });
    c.media.push({ ...m, id });
  }
  await saveNote(c);
  return c;
}

const urlCache = new Map();
async function mediaURL(id, field = 'data') {
  const k = id + ':' + field;
  if (urlCache.has(k)) return urlCache.get(k);
  const u = await db.mediaURL(id, field);
  if (!u) return null;
  urlCache.set(k, u);
  return u;
}
function revokeMedia(id) { for (const f of ['data', 'thumb']) { const k = id + ':' + f; if (urlCache.has(k)) { const u = urlCache.get(k); if (u.startsWith('blob:')) URL.revokeObjectURL(u); urlCache.delete(k); } } }

async function addMedia(n, { type, blob, thumb, ...meta }) {
  const id = uid();
  const rec = { id, noteId: n.id, type, mime: blob.type || 'application/octet-stream', data: await blob.arrayBuffer(), thumb: thumb ? await thumb.arrayBuffer() : null, createdAt: Date.now(), ...meta };
  await db.put('media', rec);
  const m = { id, type, name: meta.name || '', dur: meta.dur || 0, peaks: meta.peaks || null, size: blob.size, transcript: meta.transcript || '' };
  n.media = [...(n.media || []), m];
  await saveNote(n);
  return m;
}
async function removeMedia(n, id) {
  n.media = n.media.filter((m) => m.id !== id);
  await db.del('media', id); revokeMedia(id);
  await saveNote(n);
}

function loadImg(file) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 1000); }; im.onerror = rej; im.src = u; });
}
function scaleTo(img, max, type, q) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const sc = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, type, q));
}
async function processImage(file) {
  try {
    const img = await loadImg(file);
    const big = Math.max(img.naturalWidth, img.naturalHeight) > 2400 || file.size > 2.5e6 || !/jpe?g|png|webp|gif/.test(file.type);
    const blob = big ? await scaleTo(img, 2400, 'image/jpeg', 0.86) : file;
    const thumb = await scaleTo(img, 560, 'image/jpeg', 0.8);
    return { blob, thumb };
  } catch { return { blob: file, thumb: null }; }
}
function videoPoster(file) {
  return new Promise((res) => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
    const u = URL.createObjectURL(file); let done = false;
    const fin = (r) => { if (done) return; done = true; URL.revokeObjectURL(u); res(r); };
    setTimeout(() => fin({ thumb: null, dur: v.duration || 0 }), 7000);
    v.onloadedmetadata = () => { try { v.currentTime = Math.min(0.4, (v.duration || 1) / 3); } catch { fin({ thumb: null, dur: v.duration }); } };
    v.onseeked = () => {
      try {
        const sc = Math.min(1, 560 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas'); c.width = v.videoWidth * sc; c.height = v.videoHeight * sc;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => fin({ thumb: b, dur: v.duration }), 'image/jpeg', 0.8);
      } catch { fin({ thumb: null, dur: v.duration }); }
    };
    v.onerror = () => fin({ thumb: null, dur: 0 });
    v.src = u;
  });
}
function audioDur(file) {
  return new Promise((res) => { const a = new Audio(); const u = URL.createObjectURL(file); a.preload = 'metadata'; a.onloadedmetadata = () => { res(isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(u); }; a.onerror = () => res(0); a.src = u; setTimeout(() => res(0), 4000); });
}
async function addFile(n, file) {
  const t = file.type || '';
  if (t.startsWith('image/')) { const { blob, thumb } = await processImage(file); return addMedia(n, { type: 'image', blob, thumb, name: file.name }); }
  if (t.startsWith('video/')) { const { thumb, dur } = await videoPoster(file); return addMedia(n, { type: 'video', blob: file, thumb, dur, name: file.name }); }
  if (t.startsWith('audio/')) { const dur = await audioDur(file); return addMedia(n, { type: 'audio', blob: file, dur, name: file.name, peaks: Array.from({ length: 48 }, (_, i) => +(0.35 + 0.5 * Math.abs(Math.sin(i * 0.9)) * Math.abs(Math.cos(i * 0.37))).toFixed(2)) }); }
  return addMedia(n, { type: 'file', blob: file, name: file.name });
}
function pickFiles(accept, { multiple = true, capture } = {}) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.multiple = multiple; if (capture) inp.setAttribute('capture', capture);
  inp.style.cssText = 'position:fixed;left:-999px;opacity:0';
  document.body.appendChild(inp);
  return new Promise((res) => {
    inp.onchange = () => { res([...inp.files]); inp.remove(); };
    inp.addEventListener('cancel', () => { res([]); inp.remove(); });
    inp.click();
  });
}
async function withProgress(label, fn) {
  const t = toast(label, { sticky: true, spinner: true });
  try { return await fn(); } finally { t.close(); }
}

/* ───────────────────────── Recherche ───────────────────────── */
const hayCache = new Map();
function hay(n) {
  const c = hayCache.get(n.id);
  if (c && c.u === n.updatedAt && c.th === S.themes && c.bk === S.books) return c.h;
  const t = themeOf(n), i = subIdx(t, n.subId);
  const f = n.fiche ? FICHE.map((x) => n.fiche[x.k]).join(' ') + ' ' + (n.fiche.duree || '') : '';
  const med = (n.media || []).map((m) => (m.name || '') + ' ' + (m.transcript || '')).join(' ');
  const h = { title: norm(n.title), body: norm(n.text + ' ' + f + ' ' + med), tags: norm(allTags(n).join(' ')), meta: norm([t?.name, i >= 0 ? t.subs[i].name : '', bookOf(n)?.name, statusOf(n.status).label].join(' ')) };
  hayCache.set(n.id, { u: n.updatedAt, th: S.themes, bk: S.books, h });
  return h;
}
const tokens = (q) => norm(q).split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
function matchFilters(n, f) {
  if (f.theme && n.themeId !== f.theme) return false;
  if (f.sub && n.subId !== f.sub) return false;
  if (f.book && n.bookId !== f.book) return false;
  if (f.status && n.status !== f.status) return false;
  for (const ty of f.types || []) {
    if (ty === 'pinned' && !n.pinned) return false;
    if (ty === 'list' && !/class="cl"/.test(n.html)) return false;
    if (ty === 'fiche' && !n.fiche) return false;
    if (['image', 'video', 'audio', 'drawing', 'file'].includes(ty) && !(n.media || []).some((m) => m.type === ty)) return false;
  }
  return true;
}
function runSearch(q, f) {
  const toks = tokens(q);
  const res = [];
  for (const n of live()) {
    if (!matchFilters(n, f)) continue;
    if (!toks.length) { res.push({ n, score: 0 }); continue; }
    const h = hay(n); let score = 0, ok = true;
    for (const tk of toks) {
      let s = 0;
      if (h.title.includes(tk)) s += h.title.startsWith(tk) ? 14 : 9;
      if (h.tags.split(' ').some((x) => x.startsWith(tk))) s += 7;
      if (h.meta.includes(tk)) s += 3;
      if (h.body.includes(tk)) s += 2 + Math.min(4, h.body.split(tk).length - 2) * 0.5;
      if (!s) { ok = false; break; }
      score += s;
    }
    if (ok) res.push({ n, score: score + Math.max(0, 2 - (Date.now() - n.updatedAt) / 864e5 / 30) });
  }
  return res.sort((a, b) => b.score - a.score || byUpd(a.n, b.n));
}
function highlight(text, toks) {
  text = String(text || '');
  if (!toks.length) return esc(text);
  let nr = ''; const map = [];
  for (let i = 0; i < text.length; i++) { const c = norm(text[i]); for (let k = 0; k < c.length; k++) { nr += c[k]; map.push(i); } }
  const rg = [];
  for (const t of toks) { let p = 0; while ((p = nr.indexOf(t, p)) > -1) { rg.push([map[p], map[p + t.length - 1] + 1]); p += t.length; } }
  if (!rg.length) return esc(text);
  rg.sort((a, b) => a[0] - b[0]);
  const m = [rg[0]];
  for (const r of rg.slice(1)) { const l = m[m.length - 1]; if (r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else m.push(r); }
  let out = '', last = 0;
  for (const [a, b] of m) { out += esc(text.slice(last, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; last = b; }
  return out + esc(text.slice(last));
}
function snippet(n, toks, len = 150) {
  const f = n.fiche ? FICHE.filter((x) => !x.secret).map((x) => n.fiche[x.k]).filter(Boolean).join(' · ') : '';
  const tr = (n.media || []).map((m) => m.transcript).filter(Boolean).join(' ');
  const text = [n.text, f, tr].filter(Boolean).join(' · ').replace(/\s+/g, ' ');
  if (!toks.length) return esc(text.slice(0, len)) + (text.length > len ? '…' : '');
  const nt = norm(text); let at = -1;
  for (const t of toks) { const p = nt.indexOf(t); if (p > -1 && (at < 0 || p < at)) at = p; }
  if (at < 0) return esc(text.slice(0, len)) + (text.length > len ? '…' : '');
  const s = Math.max(0, at - 45);
  const part = text.slice(s, s + len);
  return (s > 0 ? '…' : '') + highlight(part, toks) + (s + len < text.length ? '…' : '');
}

/* ───────────────────────── Primitives d'interface ───────────────────────── */
function toast(msg, opt = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${opt.spinner ? '<span class="spin"></span>' : ''}<span>${esc(msg)}</span>${opt.label ? `<button>${esc(opt.label)}</button>` : ''}`;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); };
  if (opt.label) el.querySelector('button').onclick = () => { close(); opt.fn(); };
  if (!opt.sticky) setTimeout(close, opt.label ? 5000 : 2600);
  return { close };
}
function sheet(html, { cls = '', onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg"></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="sheet-grab"></div><div class="sheet-body">${html}</div></div>`;
  $('#sheets').appendChild(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  const sh = $('.sheet', wrap);
  const close = () => {
    if (wrap._closed) return; wrap._closed = true;
    wrap.classList.remove('open'); sh.style.transform = '';
    setTimeout(() => wrap.remove(), 340); onClose?.();
  };
  $('.sheet-bg', wrap).onclick = close;
  let y0 = null, dy = 0;
  sh.addEventListener('touchstart', (e) => { const body = $('.sheet-body', sh); if (body.scrollTop > 0 || e.target.closest('input,textarea,[contenteditable],.hscroll')) return; y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; }, { passive: true });
  sh.addEventListener('touchmove', (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sh.addEventListener('touchend', () => { if (y0 == null) return; sh.style.transition = ''; y0 = null; if (dy > 110) close(); else sh.style.transform = ''; });
  wrap.close = close;
  return wrap;
}
function menu(items, title) {
  return new Promise((res) => {
    const w = sheet(`${title ? `<div class="sheet-title">${title}</div>` : ''}<div class="menu">${items.map((it, i) => it.sep ? '<div class="menu-sep"></div>' : `<button class="menu-it ${it.danger ? 'danger' : ''}" data-i="${i}">${icon(it.icon)}<span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`).join('')}</div>`, { onClose: () => res(null) });
    w.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; const it = items[+b.dataset.i]; w.close(); res(it); setTimeout(() => it.fn?.(), 60); });
  });
}
function confirmSheet({ title, text, ok = 'Confirmer', danger = false }) {
  return new Promise((res) => {
    let r = false;
    const w = sheet(`<div class="dlg"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}<div class="dlg-btns"><button class="btn btn-soft" data-x="0">Annuler</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="1">${esc(ok)}</button></div></div>`, { onClose: () => res(r) });
    w.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; r = b.dataset.x === '1'; w.close(); });
  });
}
function askText({ title, value = '', placeholder = '', ok = 'Valider' }) {
  return new Promise((res) => {
    let r = null;
    const w = sheet(`<form class="dlg"><h3>${esc(title)}</h3><input class="field" name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"><div class="dlg-btns"><button type="button" class="btn btn-soft" data-x="0">Annuler</button><button class="btn btn-primary">${esc(ok)}</button></div></form>`, { onClose: () => res(r) });
    const f = $('form', w), inp = $('input', w);
    setTimeout(() => inp.focus(), 50);
    f.onsubmit = (e) => { e.preventDefault(); r = inp.value.trim() || null; w.close(); };
    $('[data-x]', w).onclick = () => w.close();
  });
}

/* ───────────────────────── Composants ───────────────────────── */
const logo = (s = 28) => `<svg class="logo" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--logo-bg)"/><rect x="13" y="20" width="26" height="30" rx="5" fill="#F2C94C" transform="rotate(-10 26 35)"/><rect x="20" y="15" width="26" height="30" rx="5" fill="#5ED3C3" transform="rotate(4 33 30)"/><rect x="27" y="17" width="24" height="30" rx="5" fill="#8B7CF6" transform="rotate(14 39 32)"/><path d="M33 26h11M33 31h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round" transform="rotate(14 39 32)"/></svg>`;

function coverHTML(b) {
  if (b.pattern === 'photo' && b.coverMedia) return `<div class="cover-img" data-thumb="${b.coverMedia}"></div>`;
  return coverSVG(b.pattern, b.hue, b.name, b.id);
}
function chkProgress(html) {
  if (!/class="cl"/.test(html)) return null;
  const all = (html.match(/data-c="[01]"/g) || []).length, done = (html.match(/data-c="1"/g) || []).length;
  return all ? { all, done } : null;
}
function mediaIcons(n) {
  const c = {}; (n.media || []).forEach((m) => (c[m.type] = (c[m.type] || 0) + 1));
  const map = { image: 'image', video: 'video', audio: 'mic', drawing: 'scribble', file: 'clip' };
  return Object.entries(c).map(([k, v]) => `<span>${icon(map[k])}${v > 1 ? v : ''}</span>`).join('') + (n.fiche ? `<span>${icon('sheet')}</span>` : '');
}
function noteCard(n, { hlToks } = {}) {
  const t = themeOf(n), i = subIdx(t, n.subId), c = tone(t, i);
  const vis = (n.media || []).find(isVisual);
  const prog = chkProgress(n.html);
  const sub = t ? (i >= 0 ? t.subs[i].name : t.name) : '';
  const ex = (n.text || (n.fiche?.effet ?? '')).slice(0, 260);
  return `<article class="card" data-open="${n.id}" style="${toneVars(c)}" tabindex="0">
    ${vis ? `<div class="card-media ${vis.type}" data-thumb="${vis.id}">${vis.type === 'video' ? `<span class="card-play">${icon('play')}</span>` : ''}</div>` : ''}
    <div class="card-in">
      ${n.pinned ? `<span class="card-pin">${icon('pin')}</span>` : ''}
      ${n.title ? `<h3>${hlToks ? highlight(n.title, hlToks) : esc(n.title)}</h3>` : ''}
      ${ex ? `<p>${esc(ex)}</p>` : !n.title && !vis ? '<p class="muted">Note vide</p>' : ''}
      ${prog ? `<div class="card-prog"><i style="--p:${prog.done / prog.all}"></i><span>${prog.done}/${prog.all}</span></div>` : ''}
      <footer>${sub ? `<span class="card-sub">${esc(sub)}</span>` : '<span></span>'}<span class="card-ic">${mediaIcons(n)}</span></footer>
    </div></article>`;
}
function estimate(n) { return (n.title ? 40 : 0) + Math.min((n.text || '').length, 260) * 0.42 + ((n.media || []).some(isVisual) ? 150 : 0) + (chkProgress(n.html) ? 22 : 0) + 56; }
function colCount() { const w = Math.min(innerWidth, 1280) - 32; return Math.max(2, Math.min(5, Math.floor(w / 230))); }
function masonry(notes) {
  if (S.settings.layout === 'list') return `<div class="nlist">${notes.map(noteRow).join('')}</div>`;
  const k = colCount(), cols = Array.from({ length: k }, () => ({ h: 0, html: '' }));
  notes.forEach((n, i) => { const c = cols.reduce((a, b) => (b.h < a.h - 30 ? b : a)); c.html += noteCard(n); c.h += estimate(n); });
  return `<div class="masonry" data-cols="${k}">${cols.map((c) => `<div class="mcol">${c.html}</div>`).join('')}</div>`;
}
function noteRow(n, toks = []) {
  const t = themeOf(n), i = subIdx(t, n.subId);
  const vis = (n.media || []).find(isVisual);
  const meta = [t ? (i >= 0 ? t.subs[i].name : t.name) : null, bookOf(n)?.name, relTime(n.updatedAt)].filter(Boolean).map(esc).join(' · ');
  return `<article class="row" data-open="${n.id}" style="--bar:${strong(t)};${toneVars(tone(t, i))}" tabindex="0">
    <span class="row-bar"></span>
    <div class="row-main"><h4>${n.title ? highlight(n.title, toks) : '<span class="muted">Sans titre</span>'}${n.pinned ? icon('pin', 'tiny') : ''}</h4>
      <p>${snippet(n, toks)}</p>
      <div class="row-meta"><span>${meta}</span><span class="card-ic">${mediaIcons(n)}</span></div></div>
    ${vis ? `<div class="row-thumb ${vis.type}" data-thumb="${vis.id}"></div>` : ''}
  </article>`;
}
const emptyState = (ic, title, text, cta = '') => `<div class="empty"><div class="empty-ic">${icon(ic)}</div><h3>${title}</h3><p>${text}</p>${cta}</div>`;

const io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => ents.forEach(async (en) => {
  if (!en.isIntersecting) return; io.unobserve(en.target); loadThumb(en.target);
}), { rootMargin: '300px' }) : null;
async function loadThumb(el) {
  const id = el.dataset.thumb;
  const u = (await mediaURL(id, 'thumb')) || (el.classList.contains('video') ? null : await mediaURL(id, 'data'));
  if (u) { el.style.backgroundImage = `url("${u}")`; el.classList.add('loaded'); }
}
function hydrate(root = document) { $$('[data-thumb]', root).forEach((e) => (io ? io.observe(e) : loadThumb(e))); }

/* ───────────────────────── Vues ───────────────────────── */
const VIEWS = {};
const topbar = (left, right = '', title = '') => `<header class="top"><div class="top-l">${left}</div><div class="top-t">${title}</div><div class="top-r">${right}</div></header>`;
const backBtn = (to = 'back') => `<button class="ibtn glass" data-act="${to === 'back' ? 'back' : 'go'}" data-to="${to}" aria-label="Retour">${icon('back')}</button>`;

VIEWS.home = () => {
  const notes = live();
  const h = new Date().getHours();
  const greet = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const pinned = notes.filter((n) => n.pinned).sort(byUpd);
  const recent = notes.filter((n) => !n.pinned).sort(byUpd).slice(0, 12);
  const media = notes.reduce((a, n) => a + (n.media?.length || 0), 0);
  const inProgress = notes.filter((n) => n.status === 'dev' || n.status === 'test').length;
  const dist = S.themes.map((t) => ({ t, c: notes.filter((n) => n.themeId === t.id).length })).filter((x) => x.c);
  const none = notes.filter((n) => !themeById(n.themeId)).length;
  const cand = notes.filter((n) => !n.pinned && (n.title || n.text));
  const old = cand.filter((n) => Date.now() - n.updatedAt > 5 * 864e5);
  const pool = old.length ? old : cand;
  const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  return `
  ${topbar(`<div class="brand">${logo(30)}<span>MagicNotes</span></div>`, `<button class="ibtn glass" data-act="go" data-to="settings" aria-label="Réglages">${icon('sliders')}</button>`)}
  <section class="hero rise">
    <p class="eyebrow">${esc(date)}</p>
    <h1 class="display">${greet}.</h1>
    <button class="searchbar" data-act="go" data-to="search">${icon('search')}<span>Rechercher dans ${plural(notes.length, 'note')}</span><kbd>⌘K</kbd></button>
  </section>
  <section class="quick hscroll rise" style="--d:1">${CAPTURES.filter((c) => c.k !== 'file').map((c) => `<button class="qa" data-act="capture" data-kind="${c.k}"><span class="qa-ic" style="--qa:${c.c}">${icon(c.icon)}</span><span>${c.label}</span></button>`).join('')}</section>
  <section class="stats rise" style="--d:2">
    <div class="stat-row">
      <div class="stat"><b data-count="${notes.length}">${notes.length}</b><span>${notes.length > 1 ? 'notes' : 'note'}</span></div>
      <div class="stat"><b data-count="${inProgress}">${inProgress}</b><span>en chantier</span></div>
      <div class="stat"><b data-count="${media}">${media}</b><span>médias</span></div>
      <div class="stat"><b data-count="${S.books.length}">${S.books.length}</b><span>carnets</span></div>
    </div>
    ${notes.length ? `<div class="dist">${dist.map((x) => `<i style="--w:${x.c};--col:${strong(x.t)}" title="${esc(x.t.name)}"></i>`).join('')}${none ? `<i style="--w:${none};--col:var(--ink-4)"></i>` : ''}</div>
    <div class="legend">${dist.map((x) => `<button data-act="themeSearch" data-theme="${x.t.id}"><i style="background:${strong(x.t)}"></i>${esc(x.t.name)}<b>${x.c}</b></button>`).join('')}</div>` : ''}
  </section>
  ${pinned.length ? `<section class="sec rise" style="--d:3"><div class="sec-h"><h2>Épinglées</h2></div><div class="pinned hscroll">${pinned.map((n) => noteCard(n)).join('')}</div></section>` : ''}
  ${pick && notes.length > 3 ? `<section class="sec rise" style="--d:3"><div class="sec-h"><h2>À redécouvrir</h2><button class="link" data-act="shuffle">${icon('shuffle')}Une autre</button></div>
    <div class="redisc" data-open="${pick.id}" style="${toneVars(noteTone(pick))}"><span class="redisc-k">${relTime(pick.updatedAt)} · ${esc(themeOf(pick)?.name || 'Sans thème')}</span><h3>${esc(pick.title || 'Sans titre')}</h3><p>${esc((pick.text || '').slice(0, 180))}</p><span class="redisc-go">${icon('arrowRight')}</span></div></section>` : ''}
  <section class="sec rise" style="--d:4"><div class="sec-h"><h2>Récentes</h2><button class="link" data-act="go" data-to="search">Tout voir${icon('next')}</button></div>
    ${recent.length ? masonry(recent) : emptyState('write', 'Aucune note pour l’instant', 'Capturez votre première idée avec le bouton +.')}</section>
  <section class="sec rise" style="--d:5"><div class="sec-h"><h2>Thèmes</h2><button class="link" data-act="go" data-to="themes">Gérer${icon('next')}</button></div>
    <div class="tthemes">${S.themes.map((t) => `<button class="ttile" data-act="themeSearch" data-theme="${t.id}">
      <div class="ttile-shades">${(t.subs.length ? t.subs : [null]).map((s, i) => `<i style="background:${tone(t, s ? i : -1).bg}"></i>`).join('')}</div>
      <b>${esc(t.name)}</b><span>${plural(notes.filter((n) => n.themeId === t.id).length, 'note')} · ${plural(t.subs.length, 'nuance')}</span></button>`).join('')}</div></section>
  <div class="foot-space"></div>`;
};

VIEWS.books = () => {
  const notes = live();
  return `
  ${topbar('', `<button class="ibtn glass" data-act="newBook" aria-label="Nouveau carnet">${icon('plus')}</button>`)}
  <h1 class="title-l rise">Carnets</h1>
  <p class="lede rise">${plural(S.books.length, 'carnet')} · ${plural(notes.length, 'note')}</p>
  <div class="books rise" style="--d:1">
    ${S.books.map((b, i) => { const c = notes.filter((n) => n.bookId === b.id); return `<button class="book" data-act="go" data-to="book/${b.id}" data-book="${b.id}" style="--i:${i}">
      <div class="cover">${coverHTML(b)}<span class="cover-count">${c.length}</span></div>
      <div class="book-meta"><b>${esc(b.name)}</b><span>${c.length ? 'Modifié ' + relTime(Math.max(...c.map((n) => n.updatedAt))) : 'Vide'}</span></div></button>`; }).join('')}
    <button class="book book-new" data-act="newBook"><div class="cover cover-new">${icon('plus')}<span>Nouveau carnet</span></div></button>
  </div><div class="foot-space"></div>`;
};

VIEWS.book = (id) => {
  const b = S.books.find((x) => x.id === id);
  if (!b) return VIEWS.books();
  const f = S.bookFilter[id] || (S.bookFilter[id] = { theme: null, sub: null });
  const all = live().filter((n) => n.bookId === id);
  let notes = all.filter((n) => (!f.theme || n.themeId === f.theme) && (!f.sub || n.subId === f.sub));
  notes = notes.sort((a, b2) => (b2.pinned - a.pinned) || (S.settings.sort === 'created' ? b2.createdAt - a.createdAt : S.settings.sort === 'title' ? a.title.localeCompare(b2.title, 'fr') : byUpd(a, b2)));
  const themesHere = S.themes.filter((t) => all.some((n) => n.themeId === t.id));
  const ft = themeById(f.theme);
  return `
  ${topbar(backBtn('books'), `<button class="ibtn glass" data-act="go" data-to="search" aria-label="Rechercher">${icon('search')}</button><button class="ibtn glass" data-act="bookMenu" data-id="${id}" aria-label="Options">${icon('more')}</button>`, `<span class="top-title">${esc(b.name)}</span>`)}
  <div class="book-head rise"><div class="book-mini">${coverHTML(b)}</div><div><h1 class="title-l">${esc(b.name)}</h1><p class="lede">${plural(all.length, 'note')}</p></div></div>
  ${themesHere.length ? `<div class="chips hscroll rise" style="--d:1">
    <button class="chip ${!f.theme ? 'on' : ''}" data-act="bookFilter" data-book="${id}" data-theme="">Tout<b>${all.length}</b></button>
    ${themesHere.map((t) => `<button class="chip ${f.theme === t.id ? 'on' : ''}" data-act="bookFilter" data-book="${id}" data-theme="${t.id}" style="--chip:${strong(t)}"><i class="dot"></i>${esc(t.name)}<b>${all.filter((n) => n.themeId === t.id).length}</b></button>`).join('')}
  </div>` : ''}
  ${ft && ft.subs.length ? `<div class="chips subchips hscroll">${ft.subs.map((s, i) => { const c = all.filter((n) => n.subId === s.id).length; return `<button class="chip shade ${f.sub === s.id ? 'on' : ''}" data-act="bookSub" data-book="${id}" data-sub="${s.id}" style="${toneVars(tone(ft, i))}">${esc(s.name)}<b>${c}</b></button>`; }).join('')}</div>` : ''}
  <div class="rise" style="--d:2">${notes.length ? masonry(notes) : emptyState('book', all.length ? 'Aucune note dans ce filtre' : 'Carnet vide', all.length ? 'Essayez un autre thème.' : 'Ajoutez votre première note avec le bouton +.', all.length ? '' : `<button class="btn btn-primary" data-act="capture" data-kind="write">${icon('write')}Nouvelle note</button>`)}</div>
  <div class="foot-space"></div>`;
};

VIEWS.search = () => {
  const s = S.search;
  return `
  <header class="search-head">
    <div class="search-field">${icon('search')}<input id="q" type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" placeholder="Mot, tag, méthode, accessoire…" value="${esc(s.q)}"><button class="clear" data-act="clearQ" ${s.q ? '' : 'hidden'} aria-label="Effacer">${icon('x')}</button></div>
  </header>
  <div class="chips hscroll filters" id="filters">${filterChips()}</div>
  <div id="results"></div><div class="foot-space"></div>`;
};
function filterChips() {
  const s = S.search, t = themeById(s.theme), b = S.books.find((x) => x.id === s.book);
  const types = [['image', 'Photos', 'image'], ['video', 'Vidéos', 'video'], ['audio', 'Vocaux', 'mic'], ['drawing', 'Dessins', 'scribble'], ['list', 'Listes', 'checklist'], ['fiche', 'Fiches', 'sheet'], ['file', 'Fichiers', 'clip'], ['pinned', 'Épinglées', 'pin']];
  const sub = t && s.sub ? t.subs.find((x) => x.id === s.sub) : null;
  return `<button class="chip ${t ? 'on' : ''}" data-act="fTheme" ${t ? `style="--chip:${strong(t)}"` : ''}>${t ? '<i class="dot"></i>' : icon('drop')}${t ? esc(t.name) + (sub ? ' · ' + esc(sub.name) : '') : 'Thème'}${icon('down', 'tiny')}</button>
    <button class="chip ${b ? 'on' : ''}" data-act="fBook">${icon('book')}${b ? esc(b.name) : 'Carnet'}${icon('down', 'tiny')}</button>
    <button class="chip ${s.status ? 'on' : ''}" data-act="fStatus">${icon('board')}${s.status ? statusOf(s.status).label : 'Statut'}${icon('down', 'tiny')}</button>
    ${types.map(([k, l, ic]) => `<button class="chip ${s.types.has(k) ? 'on' : ''}" data-act="fType" data-type="${k}">${icon(ic)}${l}</button>`).join('')}
    ${t || b || s.status || s.types.size ? `<button class="chip ghost" data-act="fReset">Réinitialiser</button>` : ''}`;
}
function renderResults() {
  const box = $('#results'); if (!box) return;
  const s = S.search, toks = tokens(s.q);
  const hasF = s.theme || s.book || s.status || s.types.size;
  if (!toks.length && !hasF) {
    const tagCount = {};
    live().forEach((n) => allTags(n).forEach((t) => (tagCount[t] = (tagCount[t] || 0) + 1)));
    const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 24);
    box.innerHTML = `
      ${S.settings.recent.length ? `<div class="sec-h small"><h3>Recherches récentes</h3><button class="link" data-act="clearRecent">Effacer</button></div><div class="recent">${S.settings.recent.map((r) => `<button data-act="setQ" data-q="${esc(r)}">${icon('clock')}<span>${esc(r)}</span>${icon('arrowUp', 'tiny rot')}</button>`).join('')}</div>` : ''}
      ${tags.length ? `<div class="sec-h small"><h3>Tags</h3></div><div class="tagcloud">${tags.map(([t, c]) => `<button class="tag" data-act="setQ" data-q="#${esc(t)}">#${esc(t)}<b>${c}</b></button>`).join('')}</div>` : ''}
      <div class="sec-h small"><h3>Explorer par thème</h3></div>
      <div class="explore">${S.themes.map((t) => `<button class="explore-it" data-act="themeSearch" data-theme="${t.id}" style="${toneVars(tone(t))}"><i style="background:${strong(t)}"></i><b>${esc(t.name)}</b><span>${live().filter((n) => n.themeId === t.id).length}</span></button>`).join('')}</div>
      <div class="sec-h small"><h3>Toutes les notes</h3></div>${masonry(live().sort(byUpd))}`;
    hydrate(box); return;
  }
  const res = runSearch(s.q, s);
  box.innerHTML = res.length
    ? `<div class="res-count">${plural(res.length, 'résultat')}${toks.length ? ` pour <b>« ${esc(s.q.trim())} »</b>` : ''}</div><div class="nlist">${res.map((r) => noteRow(r.n, toks)).join('')}</div>`
    : emptyState('search', 'Aucun résultat', 'Essayez un autre mot, ou retirez des filtres.');
  hydrate(box);
}
function pushRecent(q) {
  q = q.trim(); if (q.length < 2) return;
  S.settings.recent = [q, ...S.settings.recent.filter((r) => norm(r) !== norm(q))].slice(0, 8); saveSettings();
}

VIEWS.atelier = () => {
  const th = themeById(S.atelierTheme);
  const notes = live().filter((n) => !th || n.themeId === th.id);
  const counts = STATUSES.map((s) => notes.filter((n) => (n.status || 'idee') === s.id).length);
  const total = Math.max(1, notes.length);
  return `
  ${topbar('', `<button class="ibtn glass" data-act="capture" data-kind="fiche" aria-label="Nouvelle fiche">${icon('plus')}</button>`)}
  <h1 class="title-l rise">Atelier</h1>
  <p class="lede rise">Suivez chaque création, de l’intuition au répertoire.</p>
  <div class="funnel rise" style="--d:1">${STATUSES.map((s, i) => `<div class="fun st-${s.id}"><b>${counts[i]}</b><span>${s.short}</span><i style="--p:${counts[i] / total}"></i></div>`).join('')}</div>
  <div class="chips hscroll rise" style="--d:1"><button class="chip ${!th ? 'on' : ''}" data-act="atTheme" data-theme="">Tous les thèmes</button>${S.themes.map((t) => `<button class="chip ${th?.id === t.id ? 'on' : ''}" data-act="atTheme" data-theme="${t.id}" style="--chip:${strong(t)}"><i class="dot"></i>${esc(t.name)}</button>`).join('')}</div>
  <div class="board rise" style="--d:2">${STATUSES.map((s, si) => {
    const list = notes.filter((n) => (n.status || 'idee') === s.id).sort(byUpd);
    return `<section class="col" data-status="${s.id}"><header><i class="st-dot st-${s.id}"></i><b>${s.label}</b><span>${list.length}</span></header>
      <div class="col-list">${list.map((n) => { const t = themeOf(n), i = subIdx(t, n.subId); return `<article class="kcard" draggable="true" data-open="${n.id}" data-id="${n.id}" style="--bar:${strong(t)}">
        <div class="kcard-t">${esc(n.title || 'Sans titre')}</div>
        <div class="kcard-m">${t ? `<span><i style="background:${tone(t, i).bg}"></i>${esc(i >= 0 ? t.subs[i].name : t.name)}</span>` : '<span>Sans thème</span>'}<span class="card-ic">${mediaIcons(n)}</span></div>
        <div class="kcard-a">${si > 0 ? `<button data-act="stMove" data-id="${n.id}" data-dir="-1" aria-label="Étape précédente">${icon('back')}</button>` : '<span></span>'}${si < STATUSES.length - 1 ? `<button data-act="stMove" data-id="${n.id}" data-dir="1" aria-label="Étape suivante">${STATUSES[si + 1].short}${icon('next')}</button>` : ''}</div>
      </article>`; }).join('') || `<div class="col-empty">${s.desc}</div>`}</div></section>`;
  }).join('')}</div><div class="foot-space"></div>`;
};

VIEWS.themes = () => `
  ${topbar(backBtn(), `<button class="ibtn glass" data-act="editTheme" aria-label="Nouveau thème">${icon('plus')}</button>`)}
  <h1 class="title-l rise">Thèmes & couleurs</h1>
  <p class="lede rise">Chaque thème a sa couleur. Ses sous-catégories en sont des nuances, pour reconnaître une note d’un coup d’œil.</p>
  <div class="tlist rise" style="--d:1">${S.themes.map((t, ti) => { const n = live().filter((x) => x.themeId === t.id); return `<article class="tcard">
    <header><span class="tswatch" style="background:${strong(t)}"></span><div><b>${esc(t.name)}</b><span>${plural(n.length, 'note')}</span></div>
      <div class="tcard-a"><button class="ibtn sm" data-act="themeUp" data-id="${t.id}" ${ti === 0 ? 'disabled' : ''} aria-label="Monter">${icon('arrowUp')}</button><button class="ibtn sm" data-act="editTheme" data-id="${t.id}" aria-label="Modifier">${icon('pen')}</button></div></header>
    <div class="tshades">${t.subs.map((s, i) => `<button class="tshade" data-act="themeSearch" data-theme="${t.id}" data-sub="${s.id}" style="${toneVars(tone(t, i))}"><b>${esc(s.name)}</b><span>${n.filter((x) => x.subId === s.id).length}</span></button>`).join('') || '<p class="muted small">Aucune sous-catégorie</p>'}</div>
  </article>`; }).join('')}</div>
  <button class="btn btn-soft wide" data-act="editTheme">${icon('plus')}Nouveau thème</button><div class="foot-space"></div>`;

VIEWS.settings = () => {
  const st = S.settings, trash = S.notes.filter((n) => n.deleted).length;
  const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map(([v, l, ic]) => `<button class="${st[k] === v ? 'on' : ''}" data-act="setSetting" data-k="${k}" data-v="${v}">${ic ? icon(ic) : ''}${l}</button>`).join('')}</div>`;
  return `
  ${topbar(backBtn())}
  <h1 class="title-l rise">Réglages</h1>
  <div class="settings rise" style="--d:1">
    <div class="group"><h3>Apparence</h3>
      <div class="set"><span>Thème</span>${seg('mode', [['auto', 'Auto', 'auto'], ['light', 'Clair', 'sun'], ['dark', 'Sombre', 'moon']])}</div>
      <div class="set"><span>Taille du texte</span>${seg('fontSize', [['s', 'A−'], ['m', 'A'], ['l', 'A+']])}</div>
      <div class="set"><span>Affichage</span>${seg('layout', [['grid', 'Mosaïque', 'grid'], ['list', 'Liste', 'rows']])}</div>
    </div>
    <div class="group"><h3>Discrétion</h3>
      <label class="set toggle"><div><span>Masquer les méthodes</span><small>Le champ « Méthode » des fiches reste flouté jusqu’à ce que vous le touchiez — pratique quand on montre son écran.</small></div><input type="checkbox" data-act="toggleSetting" data-k="hideMethods" ${st.hideMethods ? 'checked' : ''}><i class="sw"></i></label>
    </div>
    <div class="group"><h3>Organisation</h3>
      <button class="set link-row" data-act="go" data-to="themes">${icon('drop')}<span>Thèmes & couleurs</span><small>${S.themes.length}</small>${icon('next')}</button>
      <button class="set link-row" data-act="go" data-to="books">${icon('books')}<span>Carnets</span><small>${S.books.length}</small>${icon('next')}</button>
      <button class="set link-row" data-act="go" data-to="trash">${icon('trash')}<span>Corbeille</span><small>${trash}</small>${icon('next')}</button>
    </div>
    <div class="group"><h3>Données</h3>
      <div class="set storage"><div><span>Stockage</span><small id="storage-info">Calcul…</small></div><div class="meter"><i id="storage-bar"></i></div></div>
      <button class="set link-row" data-act="export">${icon('download')}<span>Exporter une sauvegarde</span><small>.json</small>${icon('next')}</button>
      <button class="set link-row" data-act="import">${icon('upload')}<span>Importer une sauvegarde</span>${icon('next')}</button>
    </div>
    <div class="about">${logo(44)}<b>MagicNotes</b><span>Version 1.1 · ${storageMode === 'remote' ? 'Vos notes sont enregistrées dans votre espace privé claude.ai et vous suivent sur tous vos appareils.' : 'Vos notes restent sur cet appareil, sans compte ni serveur.'}</span></div>
  </div><div class="foot-space"></div>`;
};

VIEWS.trash = () => {
  const list = S.notes.filter((n) => n.deleted).sort((a, b) => b.deleted - a.deleted);
  return `
  ${topbar(backBtn(), list.length ? `<button class="btn btn-soft sm danger-t" data-act="emptyTrash">Vider</button>` : '')}
  <h1 class="title-l rise">Corbeille</h1>
  <p class="lede rise">Les notes sont supprimées définitivement après 30 jours.</p>
  <div class="nlist rise" style="--d:1">${list.map((n) => `<div class="trash-it"><div><b>${esc(n.title || 'Sans titre')}</b><span>Supprimée ${relTime(n.deleted)}</span></div>
    <button class="btn btn-soft sm" data-act="restore" data-id="${n.id}">${icon('restore')}Restaurer</button><button class="ibtn sm" data-act="purge" data-id="${n.id}" aria-label="Supprimer définitivement">${icon('trash')}</button></div>`).join('') || emptyState('trash', 'Corbeille vide', 'Rien à signaler.')}</div><div class="foot-space"></div>`;
};

/* ───────────────────────── Rendu & navigation ───────────────────────── */
function parseKey(key) { const [name, ...rest] = (key || 'home').split('/'); return { name: VIEWS[name] || name === 'note' ? name : 'home', arg: rest.join('/') }; }
// Navigation : historique du navigateur, ou pile interne quand l'app tourne dans un cadre.
const nav = framed ? (() => {
  const st = ['#/home'];
  return { push: (h) => st.push(h), replace: (h) => { st[st.length - 1] = h; }, back: () => { if (st.length > 1) st.pop(); setTimeout(onPop, 0); }, hash: () => st[st.length - 1] };
})() : { push: (h) => history.pushState({}, '', h), replace: (h) => history.replaceState({}, '', h), back: () => history.back(), hash: () => location.hash };
function keyFromHash() { return nav.hash().replace(/^#\/?/, '') || 'home'; }
const TAB_OF = { home: 'home', books: 'books', book: 'books', search: 'search', atelier: 'atelier' };

function render(key, { keepScroll = false } = {}) {
  const { name, arg } = parseKey(key);
  if (S.key) S.scroll[S.key] = scrollY;
  const changed = S.key !== key;
  S.key = key; S.last = key;
  const v = $('#view');
  v.innerHTML = VIEWS[name](arg);
  v.dataset.view = name;
  if (changed) { v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); }
  $$('#tabbar [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === TAB_OF[name]));
  hydrate(v);
  if (name === 'search') bindSearch();
  if (name === 'settings') fillStorage();
  if (name === 'atelier') bindBoard();
  if (name === 'home') countUp(v);
  scrollTo(0, keepScroll ? S.scroll[key] || 0 : changed ? (S.scroll[key] && navDir === 'back' ? S.scroll[key] : 0) : S.scroll[key] || 0);
  onScroll();
}
let navDir = 'fwd';
function refresh() { if (S.key) render(S.key, { keepScroll: true }); }
function go(key) {
  if (key === S.key) { scrollTo({ top: 0, behavior: 'smooth' }); return; }
  navDir = 'fwd'; S.depth++;
  nav.push('#/' + key);
  render(key);
}
function onPop() {
  const key = keyFromHash();
  const { name, arg } = parseKey(key);
  if (name === 'note') { if (!S.key) render('home'); if (S.editor?.note.id !== arg) openEditor(arg); return; }
  if (S.editor) { closeEditor(); if (key === S.key) return; }
  navDir = 'back'; S.depth = Math.max(0, S.depth - 1);
  if (key !== S.key) render(key);
}
function openNote(id, opts) {
  if (S.editor) return;
  nav.push('#/note/' + id);
  S.pushedNote = true;
  openEditor(id, opts);
}
function leaveEditor() {
  if (S.pushedNote) { S.pushedNote = false; nav.back(); }
  else { nav.replace('#/' + (S.last || 'home')); closeEditor(); }
}
function countUp(root) {
  $$('[data-count]', root).forEach((el) => {
    const to = +el.dataset.count; if (!to) return; const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 700); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
function onScroll() { document.body.classList.toggle('scrolled', scrollY > 24); }

function bindSearch() {
  const q = $('#q');
  const upd = debounce(() => { renderResults(); }, 90);
  const rec = debounce(() => pushRecent(S.search.q), 1600);
  q.addEventListener('input', () => { S.search.q = q.value; $('.search-field .clear').hidden = !q.value; upd(); rec(); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { pushRecent(q.value); q.blur(); } });
  renderResults();
}
function refreshFilters() { const f = $('#filters'); if (f) f.innerHTML = filterChips(); renderResults(); }

function bindBoard() {
  let dragId = null;
  $$('.kcard').forEach((c) => c.addEventListener('dragstart', (e) => { dragId = c.dataset.id; e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); }));
  $$('.kcard').forEach((c) => c.addEventListener('dragend', () => c.classList.remove('dragging')));
  $$('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async (e) => { e.preventDefault(); col.classList.remove('over'); const n = S.notes.find((x) => x.id === dragId); if (n && n.status !== col.dataset.status) { n.status = col.dataset.status; await saveNote(n); refresh(); } });
  });
}
async function fillStorage() {
  const info = $('#storage-info'), bar = $('#storage-bar'); if (!info) return;
  if (storageMode === 'remote') { info.textContent = 'Synchronisé avec votre compte Claude, privé'; bar.style.width = '100%'; return; }
  try {
    const e = await navigator.storage.estimate();
    const persisted = await navigator.storage.persisted?.();
    info.textContent = `${fmtSize(e.usage || 0)} utilisés${e.quota ? ' sur ' + fmtSize(e.quota) : ''}${persisted ? ' · stockage protégé' : ''}`;
    bar.style.width = Math.max(2, ((e.usage || 0) / (e.quota || 1)) * 100) + '%';
  } catch { info.textContent = 'Indisponible'; }
}

/* ───────────────────────── Feuilles : thèmes, carnets, statuts ───────────────────────── */
function pickTheme(cur = {}) {
  return new Promise((res) => {
    let r = null;
    const w = sheet(`<div class="sheet-title">Thème & nuance</div>
      <div class="tpick">
        <button class="tpick-none ${!cur.themeId ? 'on' : ''}" data-th="" data-sub="">${icon('x')}Aucun thème</button>
        ${S.themes.map((t) => `<div class="tpick-g"><button class="tpick-h ${cur.themeId === t.id && !cur.subId ? 'on' : ''}" data-th="${t.id}" data-sub=""><i style="background:${strong(t)}"></i>${esc(t.name)}${cur.themeId === t.id && !cur.subId ? icon('check') : ''}</button>
          <div class="tpick-s">${t.subs.map((s, i) => `<button class="shade-chip ${cur.subId === s.id ? 'on' : ''}" data-th="${t.id}" data-sub="${s.id}" style="${toneVars(tone(t, i))}">${cur.subId === s.id ? icon('check') : ''}${esc(s.name)}</button>`).join('')}</div></div>`).join('')}
      </div><button class="btn btn-soft wide" data-th-manage>${icon('sliders')}Gérer les thèmes</button>`, { cls: 'tall', onClose: () => res(r) });
    w.addEventListener('click', (e) => {
      if (e.target.closest('[data-th-manage]')) { w.close(); if (S.editor) leaveEditor(); setTimeout(() => go('themes'), 380); return; }
      const b = e.target.closest('[data-th]'); if (!b) return;
      r = { themeId: b.dataset.th || null, subId: b.dataset.sub || null }; w.close();
    });
  });
}
function pickBook(cur) {
  return new Promise((res) => {
    let r = null;
    const w = sheet(`<div class="sheet-title">Ranger dans un carnet</div><div class="bpick">${S.books.map((b) => `<button class="bpick-it ${b.id === cur ? 'on' : ''}" data-b="${b.id}"><span class="bpick-c">${coverHTML(b)}</span><b>${esc(b.name)}</b>${b.id === cur ? icon('check') : ''}</button>`).join('')}</div>`, { onClose: () => res(r) });
    hydrate(w);
    w.addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (!b) return; r = b.dataset.b; w.close(); });
  });
}
function pickStatus(cur) {
  return new Promise((res) => {
    let r = null;
    const w = sheet(`<div class="sheet-title">Avancement</div><div class="spick">${STATUSES.map((s, i) => `<button class="spick-it ${s.id === cur ? 'on' : ''}" data-s="${s.id}"><span class="spick-n st-${s.id}">${i + 1}</span><div><b>${s.label}</b><small>${s.desc}</small></div>${s.id === cur ? icon('check') : ''}</button>`).join('')}</div>`, { onClose: () => res(r) });
    w.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; r = b.dataset.s; w.close(); });
  });
}
function editTheme(id) {
  const orig = themeById(id);
  const t = orig ? structuredClone(orig) : { id: uid(), name: '', hue: HUE_PRESETS[(S.themes.length * 3) % HUE_PRESETS.length].hue, sat: HUE_PRESETS[(S.themes.length * 3) % HUE_PRESETS.length].sat, subs: [], order: S.themes.length };
  const w = sheet(`<div class="sheet-title">${orig ? 'Modifier le thème' : 'Nouveau thème'}</div>
    <div class="tedit">
      <input class="field big" id="tname" placeholder="Nom du thème (ex. Idées de tours)" value="${esc(t.name)}">
      <div class="lbl">Couleur</div>
      <div class="hues">${HUE_PRESETS.map((p) => `<button class="hue" data-hue="${p.hue}" data-sat="${p.sat}" style="background:hsl(${p.hue} ${p.sat}% 50%)" aria-label="${p.name}"></button>`).join('')}</div>
      <input type="range" class="hue-range" min="0" max="359" value="${t.hue}" aria-label="Teinte précise">
      <div class="lbl">Sous-catégories <small>chacune reçoit une nuance</small></div>
      <div class="subs" id="subs"></div>
      <form class="sub-add" id="subadd"><input class="field" placeholder="Ajouter une sous-catégorie…" id="subname"><button class="ibtn solid" aria-label="Ajouter">${icon('plus')}</button></form>
      <div class="dlg-btns">${orig ? `<button class="btn btn-soft danger-t" data-x="del">${icon('trash')}Supprimer</button>` : '<span></span>'}<button class="btn btn-primary" data-x="save">Enregistrer</button></div>
    </div>`, { cls: 'tall' });
  const drawSubs = () => {
    $('#subs', w).innerHTML = t.subs.map((s, i) => `<div class="sub-row" style="${toneVars(tone(t, i))}"><i class="sub-sw"></i><input value="${esc(s.name)}" data-sub="${i}"><button class="ibtn sm" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Monter">${icon('arrowUp')}</button><button class="ibtn sm" data-rm="${i}" aria-label="Retirer">${icon('x')}</button></div>`).join('') || '<p class="muted small">Ajoutez des nuances : Cartomagie, Pièces, Mentalisme…</p>';
    $$('.hue', w).forEach((b) => b.classList.toggle('on', +b.dataset.hue === t.hue));
    $('.tedit', w).style.setProperty('--tc', strong(t));
  };
  drawSubs();
  w.addEventListener('input', (e) => {
    if (e.target.matches('.hue-range')) { t.hue = +e.target.value; if (t.sat < 30) t.sat = 65; drawSubs(); }
    if (e.target.dataset.sub != null) t.subs[+e.target.dataset.sub].name = e.target.value;
  });
  $('#subadd', w).onsubmit = (e) => { e.preventDefault(); const v = $('#subname', w).value.trim(); if (!v) return; t.subs.push({ id: uid(), name: v }); $('#subname', w).value = ''; drawSubs(); $('#subname', w).focus(); };
  w.addEventListener('click', async (e) => {
    const h = e.target.closest('.hue'); if (h) { t.hue = +h.dataset.hue; t.sat = +h.dataset.sat; $('.hue-range', w).value = t.hue; drawSubs(); return; }
    const up = e.target.closest('[data-up]'); if (up) { const i = +up.dataset.up; [t.subs[i - 1], t.subs[i]] = [t.subs[i], t.subs[i - 1]]; drawSubs(); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { t.subs.splice(+rm.dataset.rm, 1); drawSubs(); return; }
    const x = e.target.closest('[data-x]'); if (!x) return;
    if (x.dataset.x === 'save') {
      t.name = $('#tname', w).value.trim() || 'Nouveau thème';
      t.subs = t.subs.filter((s) => s.name.trim());
      const ids = new Set(t.subs.map((s) => s.id));
      for (const n of S.notes.filter((n) => n.themeId === t.id && n.subId && !ids.has(n.subId))) { n.subId = null; await saveNote(n, false); }
      await db.put('themes', t);
      S.themes = orig ? S.themes.map((x) => (x.id === t.id ? t : x)) : [...S.themes, t];
      w.close(); refresh(); toast(orig ? 'Thème mis à jour' : 'Thème créé');
    } else if (x.dataset.x === 'del') {
      const c = S.notes.filter((n) => n.themeId === t.id).length;
      if (!(await confirmSheet({ title: `Supprimer « ${orig.name} » ?`, text: c ? `${plural(c, 'note')} perdront leur couleur, mais ne seront pas supprimées.` : '', ok: 'Supprimer', danger: true }))) return;
      for (const n of S.notes.filter((n) => n.themeId === t.id)) { n.themeId = null; n.subId = null; await saveNote(n, false); }
      await db.del('themes', t.id); S.themes = S.themes.filter((x) => x.id !== t.id);
      w.close(); refresh();
    }
  });
}
function editBook(id) {
  const orig = S.books.find((b) => b.id === id);
  const b = orig ? { ...orig } : { id: uid(), name: '', pattern: COVER_PATTERNS[S.books.length % COVER_PATTERNS.length].id, hue: COVER_HUES[(S.books.length * 5) % COVER_HUES.length], order: S.books.length, createdAt: Date.now() };
  const w = sheet(`<div class="sheet-title">${orig ? 'Modifier le carnet' : 'Nouveau carnet'}</div>
    <div class="bedit">
      <div class="bedit-prev"><div class="cover big" id="bprev"></div></div>
      <input class="field big" id="bname" placeholder="Nom du carnet" value="${esc(b.name)}">
      <div class="lbl">Couverture</div>
      <div class="patterns hscroll" id="pats"></div>
      <div class="lbl">Teinte</div>
      <div class="hues">${COVER_HUES.map((h) => `<button class="hue" data-h="${h}" style="background:hsl(${h} 70% 55%)" aria-label="Teinte"></button>`).join('')}</div>
      <div class="dlg-btns">${orig ? `<button class="btn btn-soft danger-t" data-x="del">${icon('trash')}Supprimer</button>` : '<span></span>'}<button class="btn btn-primary" data-x="save">${orig ? 'Enregistrer' : 'Créer'}</button></div>
    </div>`, { cls: 'tall' });
  const draw = () => {
    $('#bprev', w).innerHTML = coverHTML({ ...b, name: $('#bname', w).value || 'M' });
    $('#pats', w).innerHTML = COVER_PATTERNS.map((p) => `<button class="pat ${b.pattern === p.id ? 'on' : ''}" data-p="${p.id}"><span class="cover">${coverSVG(p.id, b.hue, $('#bname', w).value || 'M', b.id)}</span><small>${p.label}</small></button>`).join('') + `<button class="pat ${b.pattern === 'photo' ? 'on' : ''}" data-p="photo"><span class="cover cover-photo">${b.coverMedia ? `<span class="cover-img" data-thumb="${b.coverMedia}"></span>` : icon('image')}</span><small>Photo</small></button>`;
    $$('.hue', w).forEach((x) => x.classList.toggle('on', +x.dataset.h === b.hue));
    hydrate(w);
  };
  draw();
  $('#bname', w).addEventListener('input', debounce(draw, 200));
  w.addEventListener('click', async (e) => {
    const h = e.target.closest('[data-h]'); if (h) { b.hue = +h.dataset.h; if (b.pattern === 'photo' && !b.coverMedia) b.pattern = 'prism'; draw(); return; }
    const p = e.target.closest('[data-p]');
    if (p) {
      if (p.dataset.p === 'photo') {
        const [f] = await pickFiles('image/*', { multiple: false }); if (!f) return;
        const { blob, thumb } = await processImage(f);
        const mid = uid();
        await db.put('media', { id: mid, noteId: null, bookId: b.id, type: 'cover', mime: blob.type, data: await blob.arrayBuffer(), thumb: thumb ? await thumb.arrayBuffer() : null });
        b.coverMedia = mid;
      }
      b.pattern = p.dataset.p; draw(); return;
    }
    const x = e.target.closest('[data-x]'); if (!x) return;
    if (x.dataset.x === 'save') {
      b.name = $('#bname', w).value.trim() || 'Nouveau carnet';
      await db.put('books', b);
      S.books = orig ? S.books.map((y) => (y.id === b.id ? b : y)) : [...S.books, b];
      w.close(); if (orig) refresh(); else go('book/' + b.id);
    } else if (x.dataset.x === 'del') {
      if (S.books.length < 2) { toast('Gardez au moins un carnet'); return; }
      const notes = S.notes.filter((n) => n.bookId === b.id);
      const dest = S.books.find((y) => y.id !== b.id);
      if (!(await confirmSheet({ title: `Supprimer « ${orig.name} » ?`, text: notes.length ? `${plural(notes.length, 'note')} seront déplacées dans « ${dest.name} ».` : '', ok: 'Supprimer', danger: true }))) return;
      for (const n of notes) { n.bookId = dest.id; await saveNote(n, false); }
      await db.del('books', b.id); S.books = S.books.filter((y) => y.id !== b.id);
      w.close(); go('books');
    }
  });
}
async function cardMenu(n) {
  await menu([
    { icon: n.pinned ? 'pinOff' : 'pin', label: n.pinned ? 'Désépingler' : 'Épingler', fn: async () => { n.pinned = !n.pinned; await saveNote(n, false); refresh(); } },
    { icon: 'drop', label: 'Thème & nuance', fn: async () => { const r = await pickTheme(n); if (r) { Object.assign(n, r); await saveNote(n); refresh(); } } },
    { icon: 'board', label: 'Avancement', hint: statusOf(n.status).label, fn: async () => { const r = await pickStatus(n.status); if (r) { n.status = r; await saveNote(n); refresh(); } } },
    { icon: 'folder', label: 'Déplacer vers…', hint: bookOf(n)?.name, fn: async () => { const r = await pickBook(n.bookId); if (r) { n.bookId = r; await saveNote(n); refresh(); toast('Note déplacée'); } } },
    { icon: 'copy', label: 'Dupliquer', fn: async () => { await duplicateNote(n); refresh(); toast('Note dupliquée'); } },
    { sep: true },
    { icon: 'trash', label: 'Supprimer', danger: true, fn: async () => { await trashNote(n); refresh(); } },
  ], esc(n.title || 'Note'));
}

/* ───────────────────────── Capture ───────────────────────── */
function ctxDefaults() {
  const { name, arg } = parseKey(S.key);
  const o = {};
  if (name === 'book') { o.bookId = arg; const f = S.bookFilter[arg]; if (f?.theme) { o.themeId = f.theme; o.subId = f.sub || null; } }
  if (name === 'atelier' && S.atelierTheme) o.themeId = S.atelierTheme;
  return o;
}
function capture(kind, extra = {}) {
  const base = { ...ctxDefaults(), ...extra };
  switch (kind) {
    case 'write': { const n = newNote(base); openNote(n.id, { focus: true }); break; }
    case 'list': { const n = newNote({ ...base, html: '<ul class="cl"><li data-c="0"><br></li></ul>' }); openNote(n.id, { focus: 'list' }); break; }
    case 'fiche': { const n = newNote({ themeId: themeById('t-tours') ? 't-tours' : null, ...base, fiche: emptyFiche() }); openNote(n.id, { focus: 'title' }); break; }
    case 'photo': case 'video': case 'file': {
      const acc = kind === 'photo' ? 'image/*' : kind === 'video' ? 'video/*' : '*/*';
      pickFiles(acc).then(async (files) => {
        if (!files.length) return;
        const n = newNote(base);
        await withProgress('Importation…', async () => { for (const f of files) await addFile(n, f); });
        openNote(n.id);
      });
      break;
    }
    case 'audio': {
      if (!canRecord()) {
        pickFiles('audio/*').then(async (files) => {
          if (!files.length) return;
          const n = newNote(base);
          await withProgress('Importation…', async () => { for (const f of files) await addFile(n, f); });
          openNote(n.id);
        });
        break;
      }
      openRecorder().then(async (r) => {
        if (!r) return; if (r.error) { toast(r.error); return; }
        const n = newNote({ ...base, html: r.transcript ? `<p>${esc(r.transcript)}</p>` : '' });
        if (r.transcript) n.text = r.transcript;
        await addMedia(n, { type: 'audio', blob: r.blob, dur: r.dur, peaks: r.peaks, transcript: r.transcript, name: 'Mémo vocal' });
        openNote(n.id);
      });
      break;
    }
    case 'draw': {
      openDrawing().then(async (d) => {
        if (!d) return;
        const n = newNote(base);
        await addMedia(n, { type: 'drawing', blob: d.blob, thumb: d.thumb, strokes: d.strokes, bg: d.bg, aspect: d.aspect, name: 'Dessin' });
        openNote(n.id);
      });
      break;
    }
  }
}
function fabSheet() {
  const w = sheet(`<div class="sheet-title">Capturer une idée</div>
    <div class="fab-grid">${CAPTURES.map((c, i) => `<button class="fab-it" data-k="${c.k}" style="--i:${i}"><span class="qa-ic" style="--qa:${c.c}">${icon(c.icon)}</span><span>${c.label}</span></button>`).join('')}</div>
    <div class="sheet-sub">Depuis un modèle</div>
    <div class="tpl">${TEMPLATES.filter((t) => t.id !== 'fiche').map((t) => `<button class="tpl-it" data-t="${t.id}"><span class="tpl-ic">${icon(t.icon)}</span><div><b>${t.label}</b><small>${t.desc}</small></div>${icon('next')}</button>`).join('')}</div>`);
  w.addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]');
    if (k) { w.close(); capture(k.dataset.k); return; }
    const t = e.target.closest('[data-t]');
    if (t) {
      const tp = TEMPLATES.find((x) => x.id === t.dataset.t); w.close();
      const n = newNote({ ...ctxDefaults(), themeId: themeById(tp.theme) ? tp.theme : ctxDefaults().themeId || null, html: tp.html || '', fiche: tp.fiche ? emptyFiche() : null });
      openNote(n.id, { focus: 'title' });
    }
  });
}

/* ───────────────────────── Éditeur ───────────────────────── */
const player = new Audio();
let playing = null;
function editorHTML(n) {
  const b = bookOf(n), st = statusOf(n.status);
  const words = (n.text.match(/\S+/g) || []).length;
  return `
  <header class="ed-top">
    <button class="ibtn glass" data-e="close" aria-label="Retour">${icon('back')}</button>
    <button class="ed-theme" data-e="theme"><i class="dot"></i><span class="ed-theme-l"></span>${icon('down', 'tiny')}</button>
    <button class="ibtn glass" data-e="pin" aria-label="Épingler">${icon(n.pinned ? 'pinOff' : 'pin')}</button>
    <button class="ibtn glass" data-e="more" aria-label="Options">${icon('more')}</button>
    <button class="ibtn glass ed-done" data-e="done" aria-label="Terminé">${icon('check')}</button>
  </header>
  <div class="ed-scroll"><div class="ed-paper">
    <textarea class="ed-title" rows="1" placeholder="Titre" enterkeyhint="next">${esc(n.title)}</textarea>
    <div class="ed-meta">
      <button class="meta-btn" data-e="book">${icon('book')}<span>${esc(b?.name || 'Carnet')}</span></button>
      <button class="meta-btn" data-e="status"><i class="st-dot st-${st.id}"></i><span>${st.label}</span></button>
      <span class="meta-time">${relTime(n.updatedAt)}</span>
    </div>
    <section class="ed-fiche" ${n.fiche ? '' : 'hidden'}></section>
    <div class="ed-body" contenteditable="true" spellcheck="true" data-ph="${n.fiche ? 'Notes libres, variantes, idées de présentation…' : 'Commencez à écrire…'}">${n.html}</div>
    <section class="ed-media"></section>
    <section class="ed-tags"></section>
    <footer class="ed-foot">Créée ${fullDate(n.createdAt)} · <span class="wc">${plural(words, 'mot')}</span></footer>
  </div></div>
  <div class="ed-toolbar"><div class="tb hscroll">
    <button data-e="photo" aria-label="Photo">${icon('image')}</button>
    <button data-e="camera" aria-label="Appareil photo">${icon('camera')}</button>
    <button data-e="audio" aria-label="Mémo vocal">${icon('mic')}</button>
    <button data-e="draw" aria-label="Dessin">${icon('scribble')}</button>
    <button data-cmd="cl" aria-label="Liste à cocher">${icon('checklist')}</button>
    <span class="tb-sep"></span>
    <button data-cmd="bold" aria-label="Gras">${icon('bold')}</button>
    <button data-cmd="italic" aria-label="Italique">${icon('italic')}</button>
    <button data-cmd="h2" aria-label="Titre">${icon('heading')}</button>
    <button data-cmd="ul" aria-label="Liste à puces">${icon('list')}</button>
    <button data-cmd="ol" aria-label="Liste numérotée">${icon('olist')}</button>
    <button data-cmd="quote" aria-label="Citation">${icon('quote')}</button>
    <span class="tb-sep"></span>
    <button data-e="video" aria-label="Vidéo">${icon('video')}</button>
    <button data-e="file" aria-label="Fichier">${icon('clip')}</button>
    <button data-e="fiche" aria-label="Fiche technique">${icon('sheet')}</button>
    ${SR ? `<button data-e="dictate" aria-label="Dicter">${icon('wave')}</button>` : ''}
  </div></div>`;
}
function paintEditor() {
  const ed = S.editor; if (!ed) return;
  const n = ed.note, t = themeOf(n), i = subIdx(t, n.subId), c = tone(t, i);
  const el = $('#editor');
  el.style.cssText = toneVars(c);
  $('.ed-theme .dot', el).style.background = t ? strong(t) : 'var(--ink-4)';
  $('.ed-theme-l', el).textContent = t ? (i >= 0 ? t.subs[i].name : t.name) : 'Thème';
  $('.ed-theme', el).title = t ? t.name : '';
  setThemeColor(c.bg);
}
function setThemeColor(c) { $$('meta[name=theme-color]').forEach((m) => m.setAttribute('content', c)); }
function resetThemeColor() { setThemeColor(isDark() ? '#0D0E11' : '#F5F4F0'); }

function openEditor(id, opts = {}) {
  const n = S.notes.find((x) => x.id === id && !x.deleted);
  if (!n) { nav.replace('#/' + (S.last || 'home')); return; }
  const el = $('#editor');
  el.innerHTML = editorHTML(n);
  S.editor = { note: n, save: debounce(() => saveNote(n).then(() => { const mt = $('.meta-time', el); if (mt) mt.textContent = 'Enregistré'; }), 450) };
  paintEditor();
  renderFiche(); renderEdMedia(); renderTags();
  el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
  document.body.classList.add('editing');
  bindEditor(el, n);
  const title = $('.ed-title', el), body = $('.ed-body', el);
  autoGrow(title);
  if (opts.focus === 'title') title.focus();
  else if (opts.focus === 'list') { body.focus(); placeCaret($('li', body)); }
  else if (opts.focus) body.focus();
}
function placeCaret(node, end = true) {
  if (!node) return; const r = document.createRange(); r.selectNodeContents(node); r.collapse(!end ? true : false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function autoGrow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

async function closeEditor() {
  const ed = S.editor; if (!ed) return;
  S.editor = null;
  stopDictation();
  if (playing) { player.pause(); playing = null; }
  ed.save.cancel();
  const n = ed.note;
  syncBody(n);
  const el = $('#editor');
  document.activeElement?.blur?.();
  if (isEmpty(n)) await hardDelete(n); else await saveNote(n, false);
  el.classList.remove('open'); el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('editing');
  resetThemeColor();
  setTimeout(() => { if (!S.editor) el.innerHTML = ''; }, 380);
  refresh();
}
function syncBody(n) {
  const body = $('#editor .ed-body'); if (!body) return;
  n.html = cleanHTML(body.innerHTML);
  n.text = htmlToText(n.html);
}
function cleanHTML(h) { return h.replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '').replace(/ on\w+="[^"]*"/gi, '').replace(/^(<br>|<p><br><\/p>)$/, ''); }
function touched() {
  const ed = S.editor; if (!ed) return;
  syncBody(ed.note);
  ed.save();
  const wc = $('#editor .wc'); if (wc) wc.textContent = plural((ed.note.text.match(/\S+/g) || []).length, 'mot');
}

function bindEditor(el, n) {
  const title = $('.ed-title', el), body = $('.ed-body', el);
  title.addEventListener('input', () => { n.title = title.value.replace(/\n/g, ' '); autoGrow(title); S.editor.save(); });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); body.focus(); placeCaret(body, false); } });
  body.addEventListener('input', touched);
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const li = getSelection().anchorNode?.parentElement?.closest?.('ul.cl li') || (getSelection().anchorNode?.nodeName === 'LI' ? getSelection().anchorNode : null);
      if (li) setTimeout(() => { const cur = getSelection().anchorNode; const nli = (cur?.nodeType === 1 ? cur : cur?.parentElement)?.closest?.('ul.cl li'); if (nli && nli !== li) nli.dataset.c = '0'; }, 0);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); fmt('bold'); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); fmt('italic'); }
  });
  const inBox = (e) => { const li = e.target.closest?.('ul.cl > li'); if (!li) return null; const r = li.getBoundingClientRect(); return e.clientX - r.left < 30 ? li : null; };
  body.addEventListener('pointerdown', (e) => { if (inBox(e)) e.preventDefault(); });
  body.addEventListener('click', (e) => { const li = inBox(e); if (li) { li.dataset.c = li.dataset.c === '1' ? '0' : '1'; li.classList.add('pop'); setTimeout(() => li.classList.remove('pop'), 300); touched(); } });
  body.addEventListener('paste', async (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); await withProgress('Ajout…', async () => { for (const f of files) await addFile(n, f); }); renderEdMedia(); return; }
    const txt = e.clipboardData?.getData('text/plain');
    if (txt != null) { e.preventDefault(); document.execCommand('insertText', false, txt); }
  });
  const tb = $('.ed-toolbar', el);
  tb.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-cmd]')) e.preventDefault(); });
  tb.addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) { if (!body.contains(getSelection().anchorNode)) { body.focus(); placeCaret(body); } fmt(b.dataset.cmd); } });
  el.onclick = (e) => { const b = e.target.closest('[data-e]'); if (b) edAction(b.dataset.e, b, e); };
  // Glisser-déposer de fichiers
  el.ondragover = (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); el.classList.add('drop'); } };
  el.ondragleave = (e) => { if (e.target === el || !el.contains(e.relatedTarget)) el.classList.remove('drop'); };
  el.ondrop = async (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); el.classList.remove('drop'); await withProgress('Ajout…', async () => { for (const f of e.dataTransfer.files) await addFile(n, f); }); renderEdMedia(); };
  const tbs = $('.tb', el);
  tbs.addEventListener('scroll', () => tbs.classList.toggle('end', tbs.scrollLeft + tbs.clientWidth >= tbs.scrollWidth - 6), { passive: true });
  const sc = $('.ed-scroll', el);
  sc.addEventListener('scroll', () => el.classList.toggle('scrolled', sc.scrollTop > 10), { passive: true });
}
function fmt(cmd) {
  const q = (c) => document.queryCommandValue('formatBlock').toLowerCase().replace(/[<>]/g, '') === c;
  switch (cmd) {
    case 'bold': document.execCommand('bold'); break;
    case 'italic': document.execCommand('italic'); break;
    case 'h2': document.execCommand('formatBlock', false, q('h2') ? 'p' : 'h2'); break;
    case 'quote': document.execCommand('formatBlock', false, q('blockquote') ? 'p' : 'blockquote'); break;
    case 'ul': document.execCommand('insertUnorderedList'); break;
    case 'ol': document.execCommand('insertOrderedList'); break;
    case 'cl': {
      const node = getSelection().anchorNode; const el = node?.nodeType === 1 ? node : node?.parentElement;
      const ul = el?.closest?.('ul');
      if (ul && ul.classList.contains('cl')) { document.execCommand('insertUnorderedList'); }
      else if (ul) { ul.classList.add('cl'); $$('li', ul).forEach((li) => (li.dataset.c = '0')); }
      else {
        document.execCommand('insertUnorderedList');
        const n2 = getSelection().anchorNode; const u2 = (n2?.nodeType === 1 ? n2 : n2?.parentElement)?.closest?.('ul');
        if (u2) { u2.classList.add('cl'); $$('li', u2).forEach((li) => (li.dataset.c = li.dataset.c || '0')); }
      }
      break;
    }
  }
  touched();
}

function renderFiche() {
  const n = S.editor?.note, box = $('#editor .ed-fiche'); if (!box || !n) return;
  if (!n.fiche) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  const f = n.fiche, hide = S.settings.hideMethods;
  box.innerHTML = `<div class="fiche-h"><span>${icon('sheet')}Fiche technique</span><button class="ibtn sm" data-e="ficheMenu" aria-label="Options de la fiche">${icon('more')}</button></div>
    ${FICHE.map((x) => `<label class="ff ${x.secret ? 'secret' : ''} ${x.secret && hide && f[x.k] ? 'veiled' : ''}"><span>${x.label}${x.secret ? icon('lock', 'tiny') : ''}</span><textarea data-f="${x.k}" rows="1" placeholder="${x.ph}">${esc(f[x.k])}</textarea>${x.secret ? `<button type="button" class="veil" data-e="unveil">${icon('eye')}Toucher pour révéler</button>` : ''}</label>`).join('')}
    <div class="ff-row">
      <label class="ff"><span>Durée</span><input data-f="duree" placeholder="ex. 4 min" value="${esc(f.duree)}"></label>
      <div class="ff"><span>Difficulté</span><div class="diff">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-e="diff" data-v="${i}" class="${f.difficulte >= i ? 'on' : ''}" aria-label="Difficulté ${i}"></button>`).join('')}</div></div>
    </div>`;
  $$('textarea', box).forEach((t) => { autoGrow(t); t.addEventListener('input', () => { f[t.dataset.f] = t.value; autoGrow(t); S.editor.save(); }); });
  $('input[data-f]', box).addEventListener('input', (e) => { f.duree = e.target.value; S.editor.save(); });
}
function renderTags() {
  const n = S.editor?.note, box = $('#editor .ed-tags'); if (!box || !n) return;
  box.innerHTML = `${icon('hash', 'tiny')}${(n.tags || []).map((t) => `<span class="tagx">#${esc(t)}<button data-e="untag" data-t="${esc(t)}" aria-label="Retirer">${icon('x')}</button></span>`).join('')}
    ${(n.autoTags || []).filter((t) => !(n.tags || []).includes(t)).map((t) => `<span class="tagx auto">#${esc(t)}</span>`).join('')}
    <input class="tag-in" placeholder="${(n.tags || []).length ? '' : 'Ajouter un tag'}" enterkeyhint="done" autocapitalize="off">`;
  const inp = $('.tag-in', box);
  const add = () => { const v = inp.value.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-'); if (v && !(n.tags || []).includes(v)) { n.tags = [...(n.tags || []), v]; S.editor.save(); renderTags(); $('#editor .tag-in').focus(); } else inp.value = ''; };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } if (e.key === 'Backspace' && !inp.value && n.tags?.length) { n.tags = n.tags.slice(0, -1); S.editor.save(); renderTags(); $('#editor .tag-in').focus(); } });
  inp.addEventListener('blur', () => { if (inp.value.trim()) add(); });
}
function renderEdMedia() {
  const n = S.editor?.note, box = $('#editor .ed-media'); if (!box || !n) return;
  const vis = n.media.filter(isVisual), aud = n.media.filter((m) => m.type === 'audio'), files = n.media.filter((m) => m.type === 'file');
  box.innerHTML = `
    ${vis.length ? `<div class="mgrid c${Math.min(vis.length, 3)}">${vis.map((m) => `<button class="mtile ${m.type}" data-e="view" data-id="${m.id}" data-thumb="${m.id}">${m.type === 'video' ? `<span class="mplay">${icon('play')}</span><span class="mdur">${fmtDur(m.dur)}</span>` : ''}${m.type === 'drawing' ? `<span class="mbadge">${icon('scribble')}</span>` : ''}</button>`).join('')}</div>` : ''}
    ${aud.map((m) => `<div class="audio" data-aid="${m.id}"><button class="a-play" data-e="aplay" data-id="${m.id}" aria-label="Lire">${icon(playing === m.id && !player.paused ? 'pause' : 'play')}</button>
      <div class="a-body"><div class="a-wave" data-e="aseek" data-id="${m.id}">${(m.peaks || Array(48).fill(0.3)).map((p) => `<i style="--h:${Math.max(0.08, p)}"></i>`).join('')}</div>
      <div class="a-meta"><span>${esc(m.name || 'Mémo vocal')}</span><span class="a-time">${fmtDur(m.dur)}</span></div></div>
      <button class="ibtn sm" data-e="mmenu" data-id="${m.id}" aria-label="Options">${icon('more')}</button>
      ${m.transcript ? `<p class="a-tr">${esc(m.transcript)}</p>` : ''}</div>`).join('')}
    ${files.map((m) => `<div class="frow"><span class="fic">${icon('file')}</span><div><b>${esc(m.name)}</b><small>${fmtSize(m.size || 0)}</small></div><button class="ibtn sm" data-e="fopen" data-id="${m.id}" aria-label="Ouvrir">${icon('download')}</button><button class="ibtn sm" data-e="mmenu" data-id="${m.id}" aria-label="Options">${icon('more')}</button></div>`).join('')}`;
  hydrate(box);
}
async function toggleAudio(id) {
  const n = S.editor?.note; const m = n?.media.find((x) => x.id === id); if (!m) return;
  if (playing === id && !player.paused) { player.pause(); return; }
  if (playing !== id) { player.src = await mediaURL(id); playing = id; }
  try { await player.play(); } catch { toast('Lecture impossible sur cet appareil'); }
}
function paintAudio() {
  $$('#editor .audio').forEach((a) => {
    const id = a.dataset.aid, on = id === playing, m = S.editor?.note.media.find((x) => x.id === id);
    const btn = $('.a-play', a); const want = on && !player.paused ? 'pause' : 'play';
    if (btn.dataset.ic !== want) { btn.innerHTML = icon(want); btn.dataset.ic = want; }
    const dur = (isFinite(player.duration) && player.duration) || m?.dur || 1;
    const p = on ? player.currentTime / dur : 0;
    const bars = $$('.a-wave i', a); bars.forEach((b, i) => b.classList.toggle('on', i / bars.length < p));
    $('.a-time', a).textContent = on && player.currentTime > 0 ? `${fmtDur(player.currentTime)} / ${fmtDur(dur)}` : fmtDur(m?.dur);
    a.classList.toggle('playing', on && !player.paused);
  });
}
player.addEventListener('timeupdate', paintAudio);
player.addEventListener('play', paintAudio);
player.addEventListener('pause', paintAudio);
player.addEventListener('ended', () => { player.currentTime = 0; paintAudio(); });

let dictation = null;
function stopDictation() { if (dictation) { try { dictation.stop(); } catch {} dictation = null; $('#editor [data-e=dictate]')?.classList.remove('on'); } }
function startDictation() {
  if (dictation) { stopDictation(); return; }
  const body = $('#editor .ed-body'); body.focus();
  const r = new SR(); r.lang = 'fr-FR'; r.continuous = true; r.interimResults = false;
  r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { document.execCommand('insertText', false, e.results[i][0].transcript.trim() + ' '); touched(); } };
  r.onend = () => { if (dictation === r) stopDictation(); };
  r.onerror = () => { toast('Dictée indisponible'); stopDictation(); };
  try { r.start(); dictation = r; $('#editor [data-e=dictate]').classList.add('on'); toast('Dictée en cours… touchez à nouveau pour arrêter'); } catch { toast('Dictée indisponible'); }
}

async function edAction(a, b, ev) {
  const ed = S.editor; if (!ed) return; const n = ed.note;
  const media = (id) => n.media.find((m) => m.id === id);
  switch (a) {
    case 'close': leaveEditor(); break;
    case 'done': document.activeElement?.blur(); touched(); ed.save.flush(); toast('Enregistré'); break;
    case 'pin': n.pinned = !n.pinned; b.innerHTML = icon(n.pinned ? 'pinOff' : 'pin'); ed.save(); toast(n.pinned ? 'Note épinglée' : 'Note désépinglée'); break;
    case 'theme': { const r = await pickTheme(n); if (r && S.editor) { Object.assign(n, r); paintEditor(); ed.save(); } break; }
    case 'book': { const r = await pickBook(n.bookId); if (r && S.editor) { n.bookId = r; $('[data-e=book] span').textContent = bookOf(n).name; ed.save(); } break; }
    case 'status': { const r = await pickStatus(n.status); if (r && S.editor) { n.status = r; const st = statusOf(r); $('[data-e=status]').innerHTML = `<i class="st-dot st-${r}"></i><span>${st.label}</span>`; ed.save(); } break; }
    case 'more': {
      menu([
        { icon: 'sheet', label: n.fiche ? 'Masquer la fiche technique' : 'Ajouter une fiche technique', fn: () => edAction('fiche') },
        { icon: 'share', label: 'Partager le texte', fn: () => shareNote(n) },
        { icon: 'copy', label: 'Dupliquer', fn: async () => { syncBody(n); await saveNote(n); const c = await duplicateNote(n); leaveEditor(); setTimeout(() => openNote(c.id), 420); } },
        { icon: 'info', label: 'Informations', hint: `${plural(n.media.length, 'média')}`, fn: () => toast(`Créée ${fullDate(n.createdAt)} · modifiée ${relTime(n.updatedAt)}`) },
        { sep: true },
        { icon: 'trash', label: 'Supprimer la note', danger: true, fn: async () => { syncBody(n); const keep = n; leaveEditor(); setTimeout(() => { if (S.notes.includes(keep)) trashNote(keep).then(refresh); }, 60); } },
      ]);
      break;
    }
    case 'fiche':
      if (n.fiche && Object.values(n.fiche).some((v) => v)) {
        if (!(await confirmSheet({ title: 'Retirer la fiche technique ?', text: 'Son contenu sera supprimé.', ok: 'Retirer', danger: true }))) return;
        n.fiche = null;
      } else n.fiche = n.fiche ? null : emptyFiche();
      renderFiche(); ed.save();
      if (n.fiche) setTimeout(() => $('#editor .ed-fiche textarea')?.focus(), 50);
      break;
    case 'ficheMenu': edAction('fiche'); break;
    case 'unveil': b.closest('.ff').classList.remove('veiled'); b.closest('.ff').querySelector('textarea').focus(); break;
    case 'diff': { const v = +b.dataset.v; n.fiche.difficulte = n.fiche.difficulte === v ? v - 1 : v; $$('#editor .diff button').forEach((x) => x.classList.toggle('on', +x.dataset.v <= n.fiche.difficulte)); ed.save(); break; }
    case 'untag': n.tags = n.tags.filter((t) => t !== b.dataset.t); ed.save(); renderTags(); break;
    case 'photo': case 'camera': case 'video': case 'file': {
      const acc = a === 'video' ? 'video/*' : a === 'file' ? '*/*' : 'image/*';
      const files = await pickFiles(acc, { capture: a === 'camera' ? 'environment' : undefined, multiple: a !== 'camera' });
      if (!files.length || !S.editor) return;
      await withProgress(files.length > 1 ? `Ajout de ${files.length} fichiers…` : 'Ajout…', async () => { for (const f of files) await addFile(n, f); });
      renderEdMedia(); break;
    }
    case 'audio': {
      if (!canRecord()) {
        const files = await pickFiles('audio/*');
        if (!files.length || !S.editor) return;
        await withProgress('Ajout…', async () => { for (const f of files) await addFile(n, f); });
        renderEdMedia(); return;
      }
      const r = await openRecorder(); if (!r || !S.editor) return; if (r.error) { toast(r.error); return; }
      await addMedia(n, { type: 'audio', blob: r.blob, dur: r.dur, peaks: r.peaks, transcript: r.transcript, name: `Mémo vocal ${n.media.filter((m) => m.type === 'audio').length + 1}` });
      renderEdMedia(); break;
    }
    case 'draw': {
      const d = await openDrawing(); if (!d || !S.editor) return;
      await addMedia(n, { type: 'drawing', blob: d.blob, thumb: d.thumb, strokes: d.strokes, bg: d.bg, aspect: d.aspect, name: 'Dessin' });
      renderEdMedia(); break;
    }
    case 'dictate': startDictation(); break;
    case 'view': lightbox(n, b.dataset.id); break;
    case 'aplay': toggleAudio(b.dataset.id); break;
    case 'aseek': {
      const id = b.dataset.id; if (playing !== id) { await toggleAudio(id); }
      const r = b.getBoundingClientRect(); const dur = (isFinite(player.duration) && player.duration) || media(id).dur;
      player.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * dur; paintAudio(); break;
    }
    case 'fopen': downloadMedia(media(b.dataset.id)); break;
    case 'mmenu': {
      const m = media(b.dataset.id);
      menu([
        { icon: 'pen', label: 'Renommer', fn: async () => { const v = await askText({ title: 'Renommer', value: m.name }); if (v) { m.name = v; const rec = await db.get('media', m.id); rec.name = v; await db.put('media', rec); ed.save(); renderEdMedia(); } } },
        ...(m.transcript ? [{ icon: 'text', label: 'Insérer la transcription dans la note', fn: () => { const body = $('#editor .ed-body'); body.insertAdjacentHTML('beforeend', `<p>${esc(m.transcript)}</p>`); touched(); } }] : []),
        { icon: 'download', label: 'Enregistrer / partager', fn: () => downloadMedia(m) },
        { sep: true },
        { icon: 'trash', label: 'Supprimer', danger: true, fn: async () => { if (playing === m.id) { player.pause(); playing = null; } await removeMedia(n, m.id); renderEdMedia(); } },
      ], esc(m.name || 'Média'));
      break;
    }
  }
}
async function saveFile(file, name) {
  const dl = await downloadsApi();
  if (dl) { try { const r = await dl.save({ filename: name, data: file }); if (r?.status === 'saved') toast('Fichier enregistré'); } catch (e) { if (e?.code && e.code !== 'declined' && e.code !== 'cancelled') toast('Enregistrement impossible ici'); } return; }
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const u = URL.createObjectURL(file); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
}
async function shareNote(n) {
  syncBody(n);
  const parts = [n.title, n.text];
  if (n.fiche) FICHE.forEach((x) => n.fiche[x.k] && parts.push(`${x.label} : ${n.fiche[x.k]}`));
  const text = parts.filter(Boolean).join('\n\n');
  if (navigator.share && !framed) { try { await navigator.share({ title: n.title || 'Note', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Texte copié dans le presse-papiers'); } catch { toast('Partage indisponible'); }
}
async function downloadMedia(m) {
  const rec = await db.get('media', m.id); if (!rec) return;
  const ext = (rec.mime.split('/')[1] || 'bin').split(';')[0].replace('jpeg', 'jpg').replace('mpeg', 'mp3');
  const name = /\.\w{2,4}$/.test(m.name || '') ? m.name : `${(m.name || 'media').replace(/[^\p{L}\p{N} _-]/gu, '')}.${ext}`;
  const file = new File([rec.data], name, { type: rec.mime });
  await saveFile(file, name);
}

/* ───────────────────────── Visionneuse ───────────────────────── */
function lightbox(n, startId) {
  const list = n.media.filter(isVisual); let i = Math.max(0, list.findIndex((m) => m.id === startId));
  const el = document.createElement('div'); el.className = 'lb';
  el.innerHTML = `<div class="lb-top"><button class="ibtn dark" data-l="close" aria-label="Fermer">${icon('x')}</button><span class="lb-count"></span><span class="grow"></span>
    <button class="ibtn dark" data-l="edit" aria-label="Modifier le dessin">${icon('pen')}</button><button class="ibtn dark" data-l="share" aria-label="Partager">${icon('share')}</button><button class="ibtn dark" data-l="del" aria-label="Supprimer">${icon('trash')}</button></div>
    <div class="lb-stage"></div>
    ${list.length > 1 ? `<button class="lb-nav prev" data-l="prev" aria-label="Précédent">${icon('back')}</button><button class="lb-nav next" data-l="next" aria-label="Suivant">${icon('next')}</button>` : ''}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  const stage = $('.lb-stage', el);
  async function show(dir = 0) {
    const m = list[i]; if (!m) { close(); return; }
    $('.lb-count', el).textContent = list.length > 1 ? `${i + 1} / ${list.length}` : (m.type === 'drawing' ? 'Dessin' : m.type === 'video' ? 'Vidéo' : 'Photo');
    $('[data-l=edit]', el).hidden = m.type !== 'drawing';
    const u = await mediaURL(m.id);
    stage.innerHTML = m.type === 'video' ? `<video src="${u}" controls playsinline autoplay></video>` : `<img src="${u}" alt="">`;
    stage.firstChild.style.animation = `${dir > 0 ? 'lbInR' : dir < 0 ? 'lbInL' : 'lbIn'} .35s var(--ease)`;
  }
  const close = () => { el.classList.remove('open'); $('video', el)?.pause(); setTimeout(() => el.remove(), 300); };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-l]');
    if (!b) { if (e.target === stage) close(); return; }
    const m = list[i];
    switch (b.dataset.l) {
      case 'close': close(); break;
      case 'prev': i = (i - 1 + list.length) % list.length; show(-1); break;
      case 'next': i = (i + 1) % list.length; show(1); break;
      case 'share': downloadMedia(m); break;
      case 'del': if (await confirmSheet({ title: 'Supprimer ce média ?', ok: 'Supprimer', danger: true })) { await removeMedia(n, m.id); list.splice(i, 1); i = Math.min(i, list.length - 1); renderEdMedia(); show(); } break;
      case 'edit': {
        const rec = await db.get('media', m.id);
        const d = await openDrawing({ strokes: rec.strokes, bg: rec.bg, aspect: rec.aspect }); if (!d) return;
        Object.assign(rec, { data: await d.blob.arrayBuffer(), thumb: await d.thumb.arrayBuffer(), strokes: d.strokes, bg: d.bg, aspect: d.aspect });
        await db.put('media', rec); revokeMedia(m.id); await saveNote(n);
        renderEdMedia(); show();
        break;
      }
    }
  });
  let sx = null, sy = null;
  stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
    if (dy > 110 && Math.abs(dx) < 80) close();
    else if (Math.abs(dx) > 60 && list.length > 1) { i = (i + (dx < 0 ? 1 : -1) + list.length) % list.length; show(dx < 0 ? 1 : -1); }
  });
  show();
}

/* ───────────────────────── Sauvegarde ───────────────────────── */
const ab2b64 = (buf) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(new Blob([buf])); });
function b642ab(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
async function exportAll() {
  await withProgress('Préparation de la sauvegarde…', async () => {
    const media = await db.all('media');
    const mm = [];
    for (const m of media) mm.push({ ...m, data: m.data ? await ab2b64(m.data) : null, thumb: m.thumb ? await ab2b64(m.thumb) : null });
    const json = JSON.stringify({ app: 'MagicNotes', version: 1, exportedAt: new Date().toISOString(), notes: S.notes, books: S.books, themes: S.themes, settings: S.settings, media: mm });
    const name = `MagicNotes-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    await saveFile(file, name);
  });
}
async function importAll() {
  const [f] = await pickFiles('application/json,.json', { multiple: false }); if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); if (data.app !== 'MagicNotes') throw 0; } catch { toast('Fichier de sauvegarde invalide'); return; }
  if (!(await confirmSheet({ title: 'Importer cette sauvegarde ?', text: `${plural(data.notes?.length || 0, 'note')}, ${plural(data.books?.length || 0, 'carnet')}. Les éléments existants avec le même identifiant seront remplacés.`, ok: 'Importer' }))) return;
  await withProgress('Importation…', async () => {
    await db.putMany('themes', data.themes || []); await db.putMany('books', data.books || []);
    await db.putMany('notes', (data.notes || []).map((n) => ({ ...n, html: cleanHTML(n.html || '') })));
    for (const m of data.media || []) await db.put('media', { ...m, data: m.data ? b642ab(m.data) : null, thumb: m.thumb ? b642ab(m.thumb) : null });
    await load();
  });
  toast('Sauvegarde importée'); render(S.key);
}

/* ───────────────────────── Actions globales ───────────────────────── */
const ACT = {
  go: (b) => go(b.dataset.to),
  back: () => { if (S.depth > 0) nav.back(); else go(parseKey(S.key).name === 'book' ? 'books' : 'home'); },
  capture: (b) => capture(b.dataset.kind),
  fab: () => fabSheet(),
  newBook: () => editBook(),
  bookMenu: (b) => { const bk = S.books.find((x) => x.id === b.dataset.id); menu([
    { icon: 'pen', label: 'Modifier le carnet', fn: () => editBook(bk.id) },
    { icon: S.settings.layout === 'grid' ? 'rows' : 'grid', label: S.settings.layout === 'grid' ? 'Afficher en liste' : 'Afficher en mosaïque', fn: () => { S.settings.layout = S.settings.layout === 'grid' ? 'list' : 'grid'; saveSettings(); refresh(); } },
    { icon: 'sort', label: 'Trier par', hint: { updated: 'Modification', created: 'Création', title: 'Titre' }[S.settings.sort], fn: () => menu([['updated', 'Date de modification'], ['created', 'Date de création'], ['title', 'Titre (A → Z)']].map(([v, l]) => ({ icon: S.settings.sort === v ? 'check' : 'sort', label: l, fn: () => { S.settings.sort = v; saveSettings(); refresh(); } })), 'Trier par') },
  ], esc(bk.name)); },
  bookFilter: (b) => { S.bookFilter[b.dataset.book] = { theme: b.dataset.theme || null, sub: null }; refresh(); },
  bookSub: (b) => { const f = S.bookFilter[b.dataset.book]; f.sub = f.sub === b.dataset.sub ? null : b.dataset.sub; refresh(); },
  themeSearch: (b) => { Object.assign(S.search, { q: '', theme: b.dataset.theme, sub: b.dataset.sub || null, book: null, status: null }); S.search.types.clear(); if (S.key === 'search') { $('#q').value = ''; refreshFilters(); } else go('search'); },
  shuffle: () => refresh(),
  setQ: (b) => { S.search.q = b.dataset.q; $('#q').value = b.dataset.q; $('.search-field .clear').hidden = false; pushRecent(b.dataset.q); renderResults(); },
  clearQ: () => { S.search.q = ''; const q = $('#q'); q.value = ''; q.focus(); $('.search-field .clear').hidden = true; renderResults(); },
  clearRecent: () => { S.settings.recent = []; saveSettings(); renderResults(); },
  fType: (b) => { const t = b.dataset.type; S.search.types.has(t) ? S.search.types.delete(t) : S.search.types.add(t); refreshFilters(); },
  fTheme: async () => { const r = await pickTheme({ themeId: S.search.theme, subId: S.search.sub }); if (r) { S.search.theme = r.themeId; S.search.sub = r.subId; refreshFilters(); } },
  fBook: async () => { if (S.search.book) { S.search.book = null; refreshFilters(); return; } const r = await pickBook(S.search.book); if (r) { S.search.book = r; refreshFilters(); } },
  fStatus: async () => { if (S.search.status) { S.search.status = null; refreshFilters(); return; } const r = await pickStatus(S.search.status); if (r) { S.search.status = r; refreshFilters(); } },
  fReset: () => { Object.assign(S.search, { theme: null, sub: null, book: null, status: null }); S.search.types.clear(); refreshFilters(); },
  atTheme: (b) => { S.atelierTheme = b.dataset.theme || null; refresh(); },
  stMove: async (b) => { const n = S.notes.find((x) => x.id === b.dataset.id); const i = STATUSES.findIndex((s) => s.id === (n.status || 'idee')) + +b.dataset.dir; n.status = STATUSES[Math.max(0, Math.min(STATUSES.length - 1, i))].id; await saveNote(n); refresh(); toast(`« ${n.title || 'Sans titre'} » → ${statusOf(n.status).label}`); },
  editTheme: (b) => editTheme(b.dataset.id),
  themeUp: async (b) => { const i = S.themes.findIndex((t) => t.id === b.dataset.id); if (i < 1) return; [S.themes[i - 1], S.themes[i]] = [S.themes[i], S.themes[i - 1]]; S.themes.forEach((t, k) => (t.order = k)); await db.putMany('themes', S.themes); S.themes = [...S.themes]; refresh(); },
  setSetting: (b) => { S.settings[b.dataset.k] = b.dataset.v; saveSettings(); applySettings(); refresh(); },
  toggleSetting: (b) => { S.settings[b.dataset.k] = b.checked; saveSettings(); },
  export: () => exportAll(),
  import: () => importAll(),
  restore: async (b) => { const n = S.notes.find((x) => x.id === b.dataset.id); delete n.deleted; await saveNote(n, false); refresh(); toast('Note restaurée'); },
  purge: async (b) => { const n = S.notes.find((x) => x.id === b.dataset.id); if (await confirmSheet({ title: 'Supprimer définitivement ?', text: 'Cette action est irréversible.', ok: 'Supprimer', danger: true })) { await hardDelete(n); refresh(); } },
  emptyTrash: async () => { const l = S.notes.filter((n) => n.deleted); if (await confirmSheet({ title: 'Vider la corbeille ?', text: `${plural(l.length, 'note')} seront supprimées définitivement.`, ok: 'Vider', danger: true })) { for (const n of l) await hardDelete(n); refresh(); } },
};

let suppressClick = false;
document.addEventListener('click', (e) => {
  if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
  if (e.target.closest('#editor, .sheet-wrap, .draw, .rec, .lb')) return;
  const a = e.target.closest('[data-act]');
  if (a) { if (a.tagName !== 'INPUT') e.preventDefault(); ACT[a.dataset.act]?.(a, e); return; }
  const o = e.target.closest('[data-open]');
  if (o) openNote(o.dataset.open);
}, true);
document.addEventListener('change', (e) => { const a = e.target.closest('input[data-act]'); if (a && !e.target.closest('#editor')) ACT[a.dataset.act]?.(a, e); });

// Appui long sur une note ou un carnet → menu contextuel
let lpTimer = null, lpStart = null;
document.addEventListener('pointerdown', (e) => {
  const c = e.target.closest('#view [data-open], #view [data-book]'); if (!c || e.button > 0) return;
  lpStart = [e.clientX, e.clientY];
  c.classList.add('pressing');
  lpTimer = setTimeout(() => {
    lpTimer = null; suppressClick = true; c.classList.remove('pressing');
    if (navigator.vibrate) navigator.vibrate(8);
    if (c.dataset.open) { const n = S.notes.find((x) => x.id === c.dataset.open); if (n) cardMenu(n); }
    else editBook(c.dataset.book);
    setTimeout(() => (suppressClick = false), 600);
  }, 480);
});
const lpCancel = (e) => { if (lpTimer && (e.type !== 'pointermove' || Math.hypot(e.clientX - lpStart[0], e.clientY - lpStart[1]) > 8)) { clearTimeout(lpTimer); lpTimer = null; } if (e.type !== 'pointermove') $$('.pressing').forEach((x) => x.classList.remove('pressing')); };
['pointerup', 'pointercancel', 'pointermove'].forEach((t) => document.addEventListener(t, lpCancel, { passive: true }));
document.addEventListener('contextmenu', (e) => { const c = e.target.closest('#view [data-open]'); if (c && matchMedia('(pointer:fine)').matches) { e.preventDefault(); const n = S.notes.find((x) => x.id === c.dataset.open); if (n) cardMenu(n); } });
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (S.editor) leaveEditor(); go('search'); setTimeout(() => $('#q')?.focus(), 50); }
  if (e.key === 'Enter' && e.target.matches('#view [data-open]')) openNote(e.target.dataset.open);
  if (e.key === 'Escape') { const sh = $$('.sheet-wrap'); if (sh.length) sh[sh.length - 1].close(); else if ($('.lb')) $('.lb [data-l=close]').click(); else if (S.editor && !$('.draw,.rec')) leaveEditor(); }
});

/* ───────────────────────── Réglages d'affichage ───────────────────────── */
const mq = matchMedia('(prefers-color-scheme: dark)');
function applySettings() {
  const host = document.documentElement.dataset.theme;
  const m = S.settings.mode === 'auto' ? (host === 'dark' || host === 'light' ? host : mq.matches ? 'dark' : 'light') : S.settings.mode;
  document.documentElement.dataset.mode = m;
  document.documentElement.dataset.fs = S.settings.fontSize;
  try { localStorage.setItem('mn-mode', JSON.stringify(S.settings.mode)); } catch {}
  if (S.editor) paintEditor(); else resetThemeColor();
}
mq.addEventListener?.('change', () => { if (S.settings.mode === 'auto') { applySettings(); refresh(); } });
function syncViewport() {
  const vv = window.visualViewport; if (!vv) return;
  const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--kb', kb + 'px');
  document.body.classList.toggle('kb-open', kb > 80);
}
let lastCols = 0;
addEventListener('resize', debounce(() => { const c = colCount(); if (c !== lastCols) { lastCols = c; if (!S.editor) refresh(); } }, 150));
addEventListener('scroll', onScroll, { passive: true });

/* ───────────────────────── Démarrage ───────────────────────── */
function tabbar() {
  $('#tabbar').innerHTML = `
    <button data-tab="home" data-act="go" data-to="home">${icon('home')}<span>Accueil</span></button>
    <button data-tab="books" data-act="go" data-to="books">${icon('books')}<span>Carnets</span></button>
    <button class="fab" data-act="fab" aria-label="Nouvelle note">${icon('plus')}</button>
    <button data-tab="search" data-act="go" data-to="search">${icon('search')}<span>Recherche</span></button>
    <button data-tab="atelier" data-act="go" data-to="atelier">${icon('board')}<span>Atelier</span></button>`;
}
async function boot() {
  applySettings();
  await initStorage();
  try { await load(); } catch (e) { console.error(e); $('#view').innerHTML = emptyState('info', 'Stockage indisponible', 'Impossible de charger vos notes. Vérifiez votre connexion puis rouvrez MagicNotes.'); return; }
  applySettings();
  tabbar();
  lastCols = colCount();
  const key = keyFromHash();
  const { name, arg } = parseKey(key);
  nav.replace(framed ? '#/' + key : location.hash || '#/home');
  if (name === 'note') { render('home'); openEditor(arg); } else render(key);
  addEventListener('popstate', onPop);
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);
  syncViewport();
  setTimeout(() => document.body.classList.add('ready'), 60);
  setTimeout(() => $('#splash')?.remove(), 900);
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.hidden && S.editor) { syncBody(S.editor.note); S.editor.save.flush(); } });
addEventListener('pagehide', () => { if (S.editor) { syncBody(S.editor.note); S.editor.save.flush(); } });
boot();
