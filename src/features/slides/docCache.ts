/**
 * A small cache of slides fetched for thumbnails. An entry is reused while the
 * slide's version (its `updated_at`) is unchanged, so scrolling a list back and
 * forth costs nothing, and saving a slide makes its thumbnail load again.
 * Only the most recent `max` entries are kept.
 */
export interface DocCache<T> {
  get(id: number, version: number): Promise<T>;
  clear(): void;
}

export function createDocCache<T>(fetch: (id: number) => Promise<T>, max = 150): DocCache<T> {
  const entries = new Map<number, { version: number; doc: Promise<T> }>();
  return {
    get(id, version) {
      const hit = entries.get(id);
      if (hit && hit.version === version) {
        // Re-insert so the least recently used entry is the first in the map.
        entries.delete(id);
        entries.set(id, hit);
        return hit.doc;
      }
      const doc = fetch(id);
      entries.delete(id);
      entries.set(id, { version, doc });
      // A failed load must not be remembered: the next request tries again.
      doc.catch(() => {
        if (entries.get(id)?.doc === doc) entries.delete(id);
      });
      while (entries.size > max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return doc;
    },
    clear() {
      entries.clear();
    },
  };
}
