/**
 * PopupSearch - Handles search filtering logic for clipboard items.
 */

export class PopupSearch {
    constructor() {
        this._caseSensitive = false;
        this._regexEnabled = false;
    }

    /**
     * Update search settings.
     * @param {boolean} caseSensitive
     * @param {boolean} regexEnabled
     */
    updateSettings(caseSensitive, regexEnabled) {
        this._caseSensitive = caseSensitive;
        this._regexEnabled = regexEnabled;
    }

    /**
     * Filter items by a search query.
     * Returns the full list when the query is empty.
     * @param {Array} items - all original clipboard items
     * @param {string} query - the raw search text
     * @returns {Array} filtered items
     */
    filter(items, query) {
        const normalizedQuery = this._caseSensitive ? query : query.toLowerCase();

        if (normalizedQuery === '') {
            return items;
        }

        return items.filter(mItem => {
            let text = mItem.clipContents || mItem.entry.getStringValue();
            if (!this._caseSensitive) text = text.toLowerCase();

            if (this._regexEnabled) {
                try {
                    const flags = this._caseSensitive ? '' : 'i';
                    const regex = new RegExp(normalizedQuery, flags);
                    return regex.test(text);
                } catch (_e) {
                    // Invalid regex; fall back to literal match
                    return text.includes(normalizedQuery);
                }
            }
            return text.includes(normalizedQuery);
        });
    }
}
