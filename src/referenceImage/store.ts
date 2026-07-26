// IndexedDB blob store for reference images, keyed by animal id.
//
// Why not localStorage, where the roster and part bank live: a downscaled reference is
// ~40–80 KB and base64 inflates it by a third, so one reference costs about what four whole
// animals cost. At 50 animals that is ~4 MB of references against ~1 MB of everything else —
// past the ~5 MB origin budget on its own. See docs/svg-quality-plan.md, "R1 storage design".
//
// This is deliberately a *hybrid*, not a migration. References are new, so there is nothing
// to convert; the roster and bank stay synchronous on localStorage. Everything here is async
// and every call degrades to a no-op when IndexedDB is unavailable (private modes, SSR, the
// node test runner), because a missing reference must never block saving an animal.

import type { ReferenceCrops } from "./crop";

const DB_NAME = "creature_builder_reference_images";
const DB_VERSION = 1;
const STORE_NAME = "references";

export interface StoredReferenceImage {
  /** JPEG bytes as stored — kept so a re-save can write them straight back. */
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  byteLength: number;
  /** §R3 per-slot crops, normalized to the image so they survive a re-encode. */
  crops: ReferenceCrops;
  updatedAt: string;
}

/** What a caller hands in; `dataUrl` and `updatedAt` are derived on read. */
export interface ReferenceImageInput {
  blob: Blob;
  width: number;
  height: number;
  crops?: ReferenceCrops;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "animalId" });
    };
    request.onsuccess = () => resolve(request.result);
    // Blocked or denied storage is a normal outcome, not an error worth throwing at a caller
    // who only wanted to save an animal.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  return openDatabase().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      let request: IDBRequest<T>;
      try {
        request = work(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      } catch {
        db.close();
        resolve(null);
        return;
      }
      request.onsuccess = () => {
        resolve(request.result ?? null);
        db.close();
      };
      request.onerror = () => {
        console.warn("Reference image store operation failed:", request.error);
        resolve(null);
        db.close();
      };
    });
  });
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read the stored reference image."));
    reader.readAsDataURL(blob);
  });
}

export async function putReferenceImage(animalId: string, image: ReferenceImageInput): Promise<void> {
  if (!animalId) return;
  await runTransaction("readwrite", (store) =>
    store.put({
      animalId,
      blob: image.blob,
      width: image.width,
      height: image.height,
      crops: image.crops ?? {},
      byteLength: image.blob.size,
      updatedAt: new Date().toISOString(),
    })
  );
}

export async function getReferenceImage(animalId: string): Promise<StoredReferenceImage | null> {
  if (!animalId) return null;
  const record = await runTransaction<any>("readonly", (store) => store.get(animalId));
  if (!record?.blob) return null;
  try {
    return {
      blob: record.blob,
      dataUrl: await readAsDataUrl(record.blob),
      width: Number(record.width) || 0,
      height: Number(record.height) || 0,
      byteLength: Number(record.byteLength) || record.blob.size,
      crops: record.crops && typeof record.crops === "object" ? (record.crops as ReferenceCrops) : {},
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function deleteReferenceImage(animalId: string): Promise<void> {
  if (!animalId) return;
  await runTransaction("readwrite", (store) => store.delete(animalId));
}
