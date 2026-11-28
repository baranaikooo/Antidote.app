export type VoiceDraft = {
  id: string;
  blob: Blob;
  duration: number;
  peaks: number[];
};

export type VoiceDraftKind = "answer" | "message";
type DraftKey = [userId: string, matchId: string, kind: VoiceDraftKind];
let database: Promise<IDBDatabase> | undefined;

function openDrafts() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("antidote-voice-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

async function accessDrafts<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openDrafts();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(
      "recordings",
      mode,
      mode === "readwrite" ? { durability: "strict" } : undefined,
    );
    const request = operation(transaction.objectStore("recordings"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function readVoiceDraft(key: DraftKey): Promise<VoiceDraft | undefined> {
  return accessDrafts("readonly", (store) => store.get(key));
}

export function saveVoiceDraft(key: DraftKey, draft: VoiceDraft) {
  return accessDrafts("readwrite", (store) => store.put(draft, key));
}

export function deleteVoiceDraft(key: DraftKey) {
  return accessDrafts("readwrite", (store) => store.delete(key));
}

export function clearVoiceDrafts() {
  return accessDrafts("readwrite", (store) => store.clear());
}
