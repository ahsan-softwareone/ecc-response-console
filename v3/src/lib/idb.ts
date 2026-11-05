// Small IndexedDB wrapper. Browser-local persistence for incident records,
// uploaded originals and extracted text. Failures are surfaced, never swallowed.
const DB = 'ecc-v3';
const VERSION = 1;
export const STORES = ['incidents', 'documents', 'files', 'pages', 'assistant'] as const;
export type StoreName = typeof STORES[number];

let dbPromise: Promise<IDBDatabase> | null = null;
export class StorageError extends Error { constructor(msg: string) { super(msg); this.name = 'StorageError'; } }

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new StorageError('IndexedDB is not available in this browser')); return; }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => { const db = req.result; for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); dbPromise = null; }; resolve(db); };
    req.onerror = () => reject(new StorageError(`Could not open local storage: ${req.error?.message ?? 'unknown error'}`));
    req.onblocked = () => reject(new StorageError('Local storage is blocked by another tab'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    let req: IDBRequest<T>;
    try { req = fn(db.transaction(store, mode).objectStore(store)); } catch (e) { reject(new StorageError(String(e))); return; }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError(req.error?.name === 'QuotaExceededError' ? 'Local storage quota exceeded; the item was not saved' : `Local storage write failed: ${req.error?.message ?? 'unknown error'}`));
  }));
}

/** Facilitator control: makes writes fail so the save-failure path can be demonstrated. */
export const storageSim = { failWrites: false };
const guard = <T,>(fn: () => Promise<T>): Promise<T> => (storageSim.failWrites ? Promise.reject(new StorageError('Simulated local storage failure')) : fn());

export const idb = {
  get: <T>(store: StoreName, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  getAll: <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  put: <T>(store: StoreName, key: string, value: T) => guard(() => tx<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key))),
  del: (store: StoreName, key: string) => tx<undefined>(store, 'readwrite', (s) => s.delete(key)),
  clearAll: async () => { for (const s of STORES) await tx<undefined>(s, 'readwrite', (st) => st.clear()); },
  available: () => open().then(() => true).catch(() => false),
};
