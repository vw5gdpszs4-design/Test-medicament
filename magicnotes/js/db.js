// Couche de stockage IndexedDB — tout reste sur l'appareil.
const DB_NAME = 'magicnotes';
const VERSION = 1;
const STORES = ['notes', 'books', 'themes', 'media', 'meta'];
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
const p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
async function store(name, mode = 'readonly') { const d = await open(); return d.transaction(name, mode).objectStore(name); }

export const db = {
  async all(s) { return p((await store(s)).getAll()); },
  async get(s, id) { return p((await store(s)).get(id)); },
  async put(s, v) { return p((await store(s, 'readwrite')).put(v)); },
  async del(s, id) { return p((await store(s, 'readwrite')).delete(id)); },
  async clear(s) { return p((await store(s, 'readwrite')).clear()); },
  async putMany(s, list) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(s, 'readwrite'); const o = t.objectStore(s);
      list.forEach((v) => o.put(v));
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  },
};
