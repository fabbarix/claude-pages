/* The scorecard persists through an async window.storage API that exists in
   the artifact runtime but not in a plain browser. Back it with localStorage
   so the deployed page keeps scores across visits, on the same device only. */

const MEM = new Map();

function backing() {
  try {
    const probe = "__evs_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch (e) {
    /* Private mode or blocked site data — fall back to memory for this tab. */
    return null;
  }
}

export function installStorage() {
  if (window.storage && typeof window.storage.get === "function") return;
  const store = backing();
  window.storage = {
    async get(key) {
      const value = store ? store.getItem(key) : MEM.get(key) ?? null;
      if (value === null || value === undefined) throw new Error("No value for " + key);
      return { value };
    },
    async set(key, value) {
      if (store) store.setItem(key, value); else MEM.set(key, value);
      return { key };
    },
    async delete(key) {
      if (store) store.removeItem(key); else MEM.delete(key);
    },
  };
}
