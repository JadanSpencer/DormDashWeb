// services/cache.ts
// In-memory cache for data that doesn't change often.
// Stores are a perfect example — they don't update every second.
// Caching them means the app feels instant on navigation.

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
  }
  
  class SimpleCache {
    private store: Map<string, CacheEntry<any>> = new Map();
  
    // Store data with a TTL (time-to-live) in milliseconds
    set<T>(key: string, data: T, ttlMs: number): void {
      this.store.set(key, {
        data,
        expiresAt: Date.now() + ttlMs,
      });
    }
  
    // Get data — returns null if expired or missing
    get<T>(key: string): T | null {
      const entry = this.store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        this.store.delete(key);
        return null;
      }
      return entry.data as T;
    }
  
    // Manually invalidate a cache entry
    // Call this when you KNOW data has changed (e.g. admin edits a store)
    invalidate(key: string): void {
      this.store.delete(key);
    }
  
    // Clear everything
    clear(): void {
      this.store.clear();
    }
  }
  
  // Singleton — one cache for the whole app
  export const appCache = new SimpleCache();
  
  // Cache key constants — prevents typos
  export const CACHE_KEYS = {
    STORES: 'stores_list',
    STORE: (id: string) => `store_${id}`,
    MENU_ITEMS: (storeId: string) => `menu_${storeId}`,
    USER_PROFILE: (uid: string) => `user_${uid}`,
  };
  
  // Cache TTL constants
  export const CACHE_TTL = {
    STORES: 5 * 60 * 1000,       // 5 minutes — stores don't change often
    MENU_ITEMS: 3 * 60 * 1000,   // 3 minutes
    USER_PROFILE: 10 * 60 * 1000, // 10 minutes
  };