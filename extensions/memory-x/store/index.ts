/**
 * Memory Store - Auto-selects best implementation
 * 
 * Priority:
 * 1. better-sqlite3 (native, fastest) - if available
 * 2. sql.js (pure JS, portable) - fallback
 */

export type { MemoryLevel } from "./sqlite-store.js";

let storeImpl: "better-sqlite3" | "sql.js" | null = null;

export async function getStoreImpl(): Promise<"better-sqlite3" | "sql.js"> {
  if (storeImpl) return storeImpl;

  // Try better-sqlite3 first
  try {
    await import("better-sqlite3");
    storeImpl = "better-sqlite3";
    return storeImpl;
  } catch {
    // better-sqlite3 not available
  }

  // Fallback to sql.js
  storeImpl = "sql.js";
  return storeImpl;
}

export async function createStore(workspacePath: string): Promise<import("./sqlite-store.js").SQLiteMemoryStore | import("./sqljs-store.js").SqlJsMemoryStore> {
  const impl = await getStoreImpl();

  if (impl === "better-sqlite3") {
    const { SQLiteMemoryStore } = await import("./sqlite-store.js");
    return new SQLiteMemoryStore(workspacePath);
  }

  const { SqlJsMemoryStore } = await import("./sqljs-store.js");
  const store = new SqlJsMemoryStore(workspacePath);
  await store.init();
  return store;
}

export { SQLiteMemoryStore } from "./sqlite-store.js";
export { SqlJsMemoryStore } from "./sqljs-store.js";
