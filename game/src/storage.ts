import type { HybridRecipeV1 } from "../../src/animalPackage/hybrid";

const DATABASE = "creature-game";
const STORE = "hybrid-recipes";
const PROFILE_STORE = "player-profile";

export interface PlayerProfile {
  id: "local-player";
  geneCredits: number;
  battles: number;
  wins: number;
  unlockedPackages: string[];
}

export const INITIAL_PROFILE: PlayerProfile = {
  id: "local-player", geneCredits: 0, battles: 0, wins: 0,
  unlockedPackages: ["iron-bear@1.0.0", "storm-eagle@1.0.0", "jade-cobra@1.0.0", "night-scorpion@1.0.0"],
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(PROFILE_STORE)) request.result.createObjectStore(PROFILE_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listRecipes(): Promise<HybridRecipeV1[]> {
  const db = await openDatabase();
  try { return await requestResult(db.transaction(STORE, "readonly").objectStore(STORE).getAll()); }
  finally { db.close(); }
}

export async function saveRecipe(recipe: HybridRecipeV1) {
  const db = await openDatabase();
  try { await requestResult(db.transaction(STORE, "readwrite").objectStore(STORE).put(recipe)); }
  finally { db.close(); }
}

export async function deleteRecipe(id: string) {
  const db = await openDatabase();
  try { await requestResult(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id)); }
  finally { db.close(); }
}

export async function replaceRecipes(recipes: HybridRecipeV1[]) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    store.clear();
    for (const recipe of recipes) store.put(recipe);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export async function loadProfile(): Promise<PlayerProfile> {
  const db = await openDatabase();
  try {
    const stored = await requestResult(db.transaction(PROFILE_STORE, "readonly").objectStore(PROFILE_STORE).get(INITIAL_PROFILE.id)) as PlayerProfile | undefined;
    return stored ?? structuredClone(INITIAL_PROFILE);
  } finally { db.close(); }
}

export async function saveProfile(profile: PlayerProfile) {
  const db = await openDatabase();
  try { await requestResult(db.transaction(PROFILE_STORE, "readwrite").objectStore(PROFILE_STORE).put(profile)); }
  finally { db.close(); }
}
