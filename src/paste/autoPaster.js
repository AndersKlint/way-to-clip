import GLib from 'gi://GLib';

import { decidePasteMode } from './pasteTarget.js';

const IMAGE_PASTE_DELAY_MS = 250;
const TEXT_PASTE_DELAY_MS = 50;
const RESTORE_CLIPBOARD_DELAY_MS = 50;

export class AutoPaster {
    #clipboardManager;
    #keyboard;
    #timeoutIds = [];

    constructor({ clipboardManager, keyboard }) {
        this.#clipboardManager = clipboardManager;
        this.#keyboard = keyboard;
    }

    paste(entry, previouslySelectedEntry, onDone, target = null) {
        const releaseInhibit = this.#clipboardManager.inhibit();
        this.#clipboardManager.writeEntry(entry);

        // images need some time to land on wayland or paste hits stale stuff
        const pasteDelay = entry.isImage() ? IMAGE_PASTE_DELAY_MS : TEXT_PASTE_DELAY_MS;
        this._after(pasteDelay, () => {
            const mode = decidePasteMode(target, this.#keyboard.isPurposeTerminal);
            this.#keyboard.pressPaste(mode);
            this._after(RESTORE_CLIPBOARD_DELAY_MS, () => {
                try {
                    if (previouslySelectedEntry)
                        this.#clipboardManager.writeEntry(previouslySelectedEntry);
                } finally {
                    releaseInhibit();
                    if (onDone)
                        onDone();
                }
            });
        });
    }

    destroy() {
        for (const id of this.#timeoutIds)
            GLib.source_remove(id);
        this.#timeoutIds = [];
        this.#clipboardManager = null;
        this.#keyboard = null;
    }

    _after(ms, callback) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this.#timeoutIds = this.#timeoutIds.filter(x => x !== id);
            callback();
            return GLib.SOURCE_REMOVE;
        });
        this.#timeoutIds.push(id);
    }
}
