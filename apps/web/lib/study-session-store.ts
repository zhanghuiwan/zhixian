import type { StudySessionDraft } from "@/lib/types";

const DATABASE_NAME = "zhixian-study";
const STORE_NAME = "sessions";
const FALLBACK_PREFIX = "zhixian-study-session:";
const pendingWrites = new Map<string, Promise<void>>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function studySessionStorageKey(contextKey: string): string {
  return `v2:${contextKey}`;
}

export async function loadStudySession(key: string): Promise<StudySessionDraft | null> {
  if (typeof window === "undefined") return null;
  try {
    return (await runStore("readonly", (store) => store.get(key))) || null;
  } catch {
    try {
      const value = localStorage.getItem(`${FALLBACK_PREFIX}${key}`);
      return value ? JSON.parse(value) as StudySessionDraft : null;
    } catch {
      return null;
    }
  }
}

export async function saveStudySession(key: string, session: StudySessionDraft): Promise<void> {
  if (typeof window === "undefined") return;
  const write = async () => {
    try {
      await runStore("readwrite", (store) => store.put(session, key));
      localStorage.removeItem(`${FALLBACK_PREFIX}${key}`);
    } catch {
      try {
        localStorage.setItem(`${FALLBACK_PREFIX}${key}`, JSON.stringify(session));
      } catch {
        // Learning can continue in memory when all browser storage is unavailable.
      }
    }
  };
  const queued = (pendingWrites.get(key) || Promise.resolve()).catch(() => undefined).then(write);
  pendingWrites.set(key, queued);
  await queued;
  if (pendingWrites.get(key) === queued) pendingWrites.delete(key);
}

async function waitForPendingWrite(key: string): Promise<void> {
  try {
    await pendingWrites.get(key);
  } catch {
    // The delete operation still clears whichever storage backend is available.
  }
}

export async function removeStudySession(key: string): Promise<void> {
  if (typeof window === "undefined") return;
  await waitForPendingWrite(key);
  try {
    await runStore("readwrite", (store) => store.delete(key));
  } catch {
    // The localStorage fallback is still cleared below.
  }
  try {
    localStorage.removeItem(`${FALLBACK_PREFIX}${key}`);
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}
