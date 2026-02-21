import { flushQueue, getQueueSize } from "./offlineQueue";

export async function syncOfflineQueue() {
  await flushQueue(async (req) => {
    await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body ?? undefined
    });
  });
}

export { getQueueSize };
