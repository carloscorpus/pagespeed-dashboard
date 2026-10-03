// Persistencia del último análisis en IndexedDB (solo en este navegador).
// Todo es "best effort": si IndexedDB no está disponible (modo privado, bloqueado) las funciones
// fallan en silencio y la app sigue funcionando solo en memoria.
import type { PageResult } from '@/hooks/use-analysis';
import type { SampleInfo } from './sampling';

const DB_NAME = 'pagespeed-dashboard';
const DB_VERSION = 1;
const SESSION = 'session'; // un único registro con clave LAST
const RAW = 'raw'; // JSON crudo por prueba, clave `${url}|${strategy}`
const LAST = 'last';

export interface SavedAnalysis {
  version: 1;
  savedAt: number;
  urls: string[];
  results: Record<string, PageResult>;
  done: number;
  total: number;
  fatal: string | null;
  /** true si la pestaña se cerró/recargó con el análisis en curso. */
  running: boolean;
  withRaw: boolean;
  /** Grupos de páginas repetitivas analizados por muestra (no existe en registros anteriores). */
  samples?: SampleInfo[];
  // Los registros guardados antes de 2026-10-03 traen además `detected` y `manual` (plataforma): se ignoran.
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSION)) db.createObjectStore(SESSION);
      if (!db.objectStoreNames.contains(RAW)) db.createObjectStore(RAW);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

async function tx<T>(
  stores: string[],
  mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function saveAnalysis(s: Omit<SavedAnalysis, 'version' | 'savedAt'>): Promise<void> {
  try {
    await tx([SESSION], 'readwrite', (t) => t.objectStore(SESSION).put({ ...s, version: 1, savedAt: Date.now() }, LAST));
  } catch { /* sin persistencia */ }
}

export async function loadAnalysis(): Promise<SavedAnalysis | null> {
  try {
    const s = await tx<SavedAnalysis>([SESSION], 'readonly', (t) => t.objectStore(SESSION).get(LAST));
    return s?.version === 1 && s.urls?.length ? s : null;
  } catch {
    return null;
  }
}

/** Borra el análisis guardado y su JSON crudo (al empezar uno nuevo). */
export async function clearAnalysis(): Promise<void> {
  try {
    await tx([SESSION, RAW], 'readwrite', (t) => { t.objectStore(SESSION).clear(); t.objectStore(RAW).clear(); });
  } catch { /* sin persistencia */ }
}

export async function saveRaw(key: string, raw: unknown): Promise<void> {
  try {
    await tx([RAW], 'readwrite', (t) => t.objectStore(RAW).put(raw, key));
  } catch { /* sin persistencia (p. ej. cuota llena) */ }
}

export async function loadAllRaw(): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(RAW, 'readonly').objectStore(RAW).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve();
        out.set(String(c.key), c.value);
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch { /* sin persistencia */ }
  return out;
}
