export class PopupSearch {
    #caseSensitive = false;
    #regexEnabled = false;

    updateSettings(caseSensitive, regexEnabled) {
        this.#caseSensitive = !!caseSensitive;
        this.#regexEnabled = !!regexEnabled;
    }

    get caseSensitive() {
        return this.#caseSensitive;
    }

    get regexEnabled() {
        return this.#regexEnabled;
    }

    setCaseSensitive(value) {
        this.#caseSensitive = !!value;
    }

    setRegexEnabled(value) {
        this.#regexEnabled = !!value;
    }

    filter(items, query) {
        if (query === '') {
            return items;
        }

        return items.filter(entry => {
            const text = entry.getStringValue();

            if (this.#regexEnabled) {
                try {
                    const flags = this.#caseSensitive ? '' : 'i';
                    return new RegExp(query, flags).test(text);
                } catch (_e) {
                    // bad regex, just do a plain contains
                    const q = this.#caseSensitive ? query : query.toLowerCase();
                    const t = this.#caseSensitive ? text : text.toLowerCase();
                    return t.includes(q);
                }
            }
            const q = this.#caseSensitive ? query : query.toLowerCase();
            const t = this.#caseSensitive ? text : text.toLowerCase();
            return t.includes(q);
        });
    }
}
