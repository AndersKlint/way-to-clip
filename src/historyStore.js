/**
 * HistoryStore - pure in-memory clipboard history model.
 *
 * Owns the ordered entry list, the selected entry, and trim/move
 * rules. No St/PopupMenu/GSettings dependencies so it is unit
 * testable with plain gjs. The Indicator maps store records to
 * ClipboardMenuItem widgets.
 */

export class HistoryStore {
    #entries = [];
    #selected = null;

    get entries() {
        return [...this.#entries];
    }

    get selected() {
        return this.#selected;
    }

    get length() {
        return this.#entries.length;
    }

    load(entries, selectedEntry = null) {
        this.#entries = [...entries];
        if (selectedEntry && this.#entries.includes(selectedEntry)) {
            this.#selected = selectedEntry;
        } else {
            this.#selected = this.#entries.length
                ? this.#entries[this.#entries.length - 1]
                : null;
        }
    }

    has(entry) {
        return this.#entries.some(e => e.equals(entry));
    }

    findEqual(entry) {
        return this.#entries.find(e => e.equals(entry)) ?? null;
    }

    add(entry) {
        this.#entries.push(entry);
        return entry;
    }

    select(entry, { moveFirst = false } = {}) {
        const existing = this.#entries.includes(entry)
            ? entry
            : this.findEqual(entry);
        if (!existing)
            return null;
        this.#selected = existing;
        if (moveFirst && !existing.isFavorite()) {
            this.#entries = this.#entries.filter(e => e !== existing);
            this.#entries.push(existing);
        }
        return existing;
    }

    toggleFavorite(entry) {
        entry.favorite = !entry.isFavorite();
        return entry.isFavorite();
    }

    /**
     * Remove one entry. Returns true if the removed entry was selected.
     * Image file deletion is the caller's job (Registry).
     */
    remove(entry) {
        const idx = this.#entries.indexOf(entry);
        if (idx < 0)
            return false;
        const wasSelected = this.#selected === entry;
        this.#entries.splice(idx, 1);
        if (wasSelected)
            this.#selected = this.#entries.length ? this.#entries[this.#entries.length - 1] : null;
        return wasSelected;
    }

    /**
     * Remove oldest non-favorites until within maxSize.
     * Returns the removed entries so the caller can delete image files
     * and persist once (single write, not N writes).
     */
    trim(maxSize) {
        const removed = [];
        let nonFavorites = this.#entries.filter(e => !e.isFavorite());
        while (nonFavorites.length > maxSize) {
            const oldest = nonFavorites.shift();
            const idx = this.#entries.indexOf(oldest);
            if (idx >= 0) {
                const wasSelected = this.#selected === oldest;
                this.#entries.splice(idx, 1);
                removed.push({ entry: oldest, wasSelected });
                if (wasSelected)
                    this.#selected = this.#entries.length ? this.#entries[this.#entries.length - 1] : null;
            }
            nonFavorites = this.#entries.filter(e => !e.isFavorite());
        }
        return removed;
    }

    /**
     * Clear non-favorites (favorites always survive).
     * When keepSelected is true the selected entry survives too.
     * Returns { removed, clearedClipboard } for the caller to act on.
     */
    clear({ keepSelected = false } = {}) {
        const removed = [];
        let clearedClipboard = false;
        for (const entry of [...this.#entries]) {
            if (entry.isFavorite())
                continue;
            if (keepSelected && this.#selected === entry)
                continue;
            const wasSelected = this.#selected === entry;
            this.remove(entry);
            removed.push({ entry, wasSelected });
            if (wasSelected)
                clearedClipboard = true;
        }
        return { removed, clearedClipboard };
    }

    toPersistable({ cacheOnlyFavorite = false } = {}) {
        if (!cacheOnlyFavorite)
            return [...this.#entries];
        return this.#entries.filter(e => e.isFavorite());
    }
}
