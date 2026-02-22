type QueuedRequest = {
  id: string;
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
  createdAt: number;
};

const DB_NAME = "posweb-offline";
const STORE = "queue";

function createQueueId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const random = `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
  return `q_${Date.now().toString(36)}_${random.slice(0, 16)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueRequest(request: Omit<QueuedRequest, "id" | "createdAt">) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const id = createQueueId();
  store.put({ ...request, id, createdAt: Date.now() });
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushQueue(fetcher: (req: QueuedRequest) => Promise<void>) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const all = store.getAll();

  return new Promise<void>((resolve, reject) => {
    all.onsuccess = async () => {
      const items = all.result as QueuedRequest[];
      for (const item of items) {
        await fetcher(item);
        store.delete(item.id);
      }
      resolve();
    };
    all.onerror = () => reject(all.error);
  });
}

export async function getQueueSize() {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const count = store.count();
  return new Promise<number>((resolve, reject) => {
    count.onsuccess = () => resolve(count.result);
    count.onerror = () => reject(count.error);
  });
}
