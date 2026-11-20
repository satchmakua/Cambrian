/**
 * Where the valley in play is kept between visits: one saved World (persist.ts's JSON), in the browser's
 * IndexedDB. (It lived in localStorage, which holds about five megabytes and shares them with the breeder:
 * a valley in its twenty-sixth year was 880 KB, and still growing.) Where the browser gives no database, a
 * store in memory: the valley then lasts until the page closes.
 *
 * Every method resolves (or rejects with a readable error); none throws.
 */
export interface ValleyStore {
  get(): Promise<string | null>;
  put(json: string): Promise<void>;
  clear(): Promise<void>;
}

export function memoryValleyStore(): ValleyStore {
  let kept: string | null = null;
  return {
    get: async () => kept,
    put: async (json) => {
      kept = json;
    },
    clear: async () => {
      kept = null;
    },
  };
}

const DB_NAME = 'cambrian-valley';
const DB_VERSION = 1;
const STORE = 'valley';
const KEY = 'current';

export function idbValleyStore(factory: IDBFactory, dbName = DB_NAME): ValleyStore {
  let opening: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (!opening) {
      opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = factory.open(dbName, DB_VERSION);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error('The browser would not open the valley’s database.'));
        req.onblocked = () => reject(new Error('The valley’s database is in use by another tab.'));
      });
      // (a failed open is tried again on the next call, not remembered)
      opening.catch(() => {
        opening = null;
      });
    }
    return opening;
  };
  const run = async <T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'There is no room left in the browser to keep the valley.' : 'The valley could not be kept.'));
      tx.onabort = () => reject(new Error('Keeping the valley was interrupted.'));
    });
  };
  return {
    get: async () => {
      const v = await run<unknown>('readonly', (s) => s.get(KEY));
      return typeof v === 'string' ? v : null;
    },
    put: async (json) => {
      await run('readwrite', (s) => s.put(json, KEY));
    },
    clear: async () => {
      await run('readwrite', (s) => s.delete(KEY));
    },
  };
}

let VALLEY: ValleyStore | null = null;

/** The page's valley store: the browser's database where there is one, else memory. */
export function valleyStore(): ValleyStore {
  if (!VALLEY) VALLEY = typeof indexedDB !== 'undefined' ? idbValleyStore(indexedDB) : memoryValleyStore();
  return VALLEY;
}

/** Put another store in its place (the tests' stand-in for a browser whose store is full). */
export function setValleyStore(s: ValleyStore): void {
  VALLEY = s;
}
