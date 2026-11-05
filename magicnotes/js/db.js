// Couche de stockage.
// - Hébergée sur claude.ai : notes dans la base privée de votre compte (db), médias dans le stockage
//   de fichiers (assets) ou, pour les formats refusés (audio…), découpés en morceaux dans la base.
// - Ailleurs (GitHub Pages, fichier local) : IndexedDB sur l'appareil.
const DB_NAME = 'magicnotes';
const VERSION = 1;
const STORES = ['notes', 'books', 'themes', 'media', 'meta'];
const BLOB_FIELDS = ['data', 'thumb', 'strokes'];
const CHUNK = 180000; // caractères base64 par document (< 256 Kio)

export let storageMode = 'local';
let remote = null;

/* ───── IndexedDB (local) ───── */
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => { const d = r.result; for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
const p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
async function store(name, mode = 'readonly') { const d = await open(); return d.transaction(name, mode).objectStore(name); }
const local = {
  async all(s) { return p((await store(s)).getAll()); },
  async get(s, id) { return p((await store(s)).get(id)); },
  async put(s, v) { return p((await store(s, 'readwrite')).put(v)); },
  async del(s, id) { return p((await store(s, 'readwrite')).delete(id)); },
  async putMany(s, list) {
    const d = await open();
    return new Promise((res, rej) => { const t = d.transaction(s, 'readwrite'); const o = t.objectStore(s); list.forEach((v) => o.put(v)); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  },
  async mediaURL(id, field) {
    const m = await local.get('media', id);
    if (!m || !m[field]) return null;
    return URL.createObjectURL(new Blob([m[field]], { type: field === 'data' ? m.mime : 'image/jpeg' }));
  },
};

/* ───── Compte claude.ai (remote) ───── */
const timeout = (pr, ms, msg) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const chains = new Map();
function serial(key, fn) { const prev = chains.get(key) || Promise.resolve(); const next = prev.catch(() => {}).then(fn); chains.set(key, next); return next; }
const refs = new WeakMap(); // ArrayBuffer déjà stocké → sa référence (évite les doublons)
function b64(buf) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(new Blob([buf])); }); }
function unb64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

async function saveBuf(buf, mime, key) {
  if (refs.has(buf)) return refs.get(buf);
  let ref = null;
  const type = (mime || '').split(';')[0].trim();
  if (remote.assets && type && buf.byteLength < 19.5 * 1024 * 1024) {
    try { const a = await remote.assets.upload(new Blob([buf], { type })); ref = { a: a.id }; } catch { ref = null; }
  }
  if (!ref) {
    const s = await b64(buf);
    const n = Math.max(1, Math.ceil(s.length / CHUNK));
    for (let i = 0; i < n; i++) await remote.col('chunks').doc(`${key}~${i}`).set({ d: s.slice(i * CHUNK, (i + 1) * CHUNK) });
    ref = { c: key, n };
  }
  refs.set(buf, ref);
  return ref;
}
async function loadBuf(ref) {
  let buf;
  if (ref.a) buf = await (await fetch('/_blob/' + ref.a)).arrayBuffer();
  else {
    const parts = await Promise.all(Array.from({ length: ref.n }, (_, i) => remote.col('chunks').doc(`${ref.c}~${i}`).get()));
    buf = unb64(parts.map((d) => d.data()?.d || '').join(''));
  }
  refs.set(buf, ref);
  return buf;
}
async function encodeMedia(v) {
  const out = {};
  for (const [k, val] of Object.entries(v)) if (!BLOB_FIELDS.includes(k)) out[k] = val;
  for (const f of BLOB_FIELDS) {
    const val = v[f];
    if (val == null) continue;
    if (f === 'strokes') {
      const txt = JSON.stringify(val);
      if (txt.length < 150000) { out.strokes = val; continue; }
      out._strokes = await saveBuf(new TextEncoder().encode(txt).buffer, 'application/json', v.id + '-strokes-' + Date.now().toString(36));
    } else out['_' + f] = await saveBuf(val, f === 'data' ? v.mime : 'image/jpeg', `${v.id}-${f}-${Date.now().toString(36)}`);
  }
  return out;
}
async function decodeMedia(d) {
  const v = clone(d);
  for (const f of ['data', 'thumb']) if (d['_' + f]) v[f] = await loadBuf(d['_' + f]);
  if (d._strokes) v.strokes = JSON.parse(new TextDecoder().decode(await loadBuf(d._strokes)));
  return v;
}
const remoteApi = {
  async all(s) {
    const snap = await timeout(remote.col(s).get(), 15000, 'timeout');
    const docs = snap.docs.map((d) => d.data());
    return s === 'media' ? Promise.all(docs.map(decodeMedia)) : docs.map(clone);
  },
  async get(s, id) {
    const d = await remote.col(s).doc(id).get();
    if (!d.exists) return undefined;
    return s === 'media' ? decodeMedia(d.data()) : clone(d.data());
  },
  async put(s, v) {
    return serial(s + '/' + v.id, async () => { const body = s === 'media' ? await encodeMedia(v) : clone(v); await remote.col(s).doc(v.id).set(body); });
  },
  async del(s, id) { return serial(s + '/' + id, () => remote.col(s).doc(id).delete()); },
  async putMany(s, list) { for (const v of list) await remoteApi.put(s, v); },
  async mediaURL(id, field) {
    const d = await remote.col('media').doc(id).get();
    const m = d.data(); const ref = m?.['_' + field];
    if (!ref) return null;
    if (ref.a) return '/_blob/' + ref.a;
    return URL.createObjectURL(new Blob([await loadBuf(ref)], { type: field === 'data' ? m.mime : 'image/jpeg' }));
  },
};

export async function initStorage() {
  if (!window.claude?.use) return storageMode;
  try {
    const [cdb, user, assets] = await Promise.all([window.claude.use('db'), window.claude.use('user'), window.claude.use('assets')]);
    const uid = cdb && user ? await user.id() : null;
    if (!uid) return storageMode;
    const base = cdb.doc(`data/users/${uid}/magicnotes`);
    const cols = {};
    remote = { col: (s) => (cols[s] ||= base.collection(s)), assets };
    storageMode = 'remote';
  } catch { /* stockage local */ }
  return storageMode;
}
export async function downloadsApi() { try { return window.claude?.use ? await window.claude.use('downloads') : null; } catch { return null; } }

export const db = {
  all: (s) => (remote ? remoteApi : local).all(s),
  get: (s, id) => (remote ? remoteApi : local).get(s, id),
  put: (s, v) => (remote ? remoteApi : local).put(s, v),
  del: (s, id) => (remote ? remoteApi : local).del(s, id),
  putMany: (s, l) => (remote ? remoteApi : local).putMany(s, l),
  mediaURL: (id, f) => (remote ? remoteApi : local).mediaURL(id, f),
};
