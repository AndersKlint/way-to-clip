/**
 * AutoPaster - clipboard set + synthetic paste keypresses.
 *
 * Extracted from WayToClip.#autoPasteAndClose. Uses ClipboardManager's
 * inhibit() token so the temporary clipboard set + restore doesn't
 * pollute history (the old `preventIndicatorUpdate` flag was never read).
 * All timeouts are GLib sources owned here and cancelled on destroy().
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

export class AutoPaster {
    #clipboardManager;
    #keyboard;
    #timeoutIds = [];

    constructor({ clipboardManager, keyboard }) {
        this.#clipboardManager = clipboardManager;
        this.#keyboard = keyboard;
    }

    /**
     * Set the clipboard to entry, synthesize paste, then restore the
     * previously selected entry. onDone runs after restore.
     */
    paste(entry, previouslySelectedEntry, onDone) {
        const releaseInhibit = this.#clipboardManager.inhibit();
        this.#clipboardManager.writeEntry(entry);

        this._after(50, () => {
            if (this.#keyboard.purpose === Clutter.InputContentPurpose.TERMINAL) {
                this._pressRelease(
                    Clutter.KEY_Control_L, Clutter.KEY_Shift_L, Clutter.KEY_Insert);
            } else {
                this._pressRelease(Clutter.KEY_Shift_L, Clutter.KEY_Insert);
            }
            this._after(50, () => {
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
        for (const id of this.#timeoutIds) {
            try {
                GLib.source_remove(id);
            } catch (_e) { /* ignore */ }
        }
        this.#timeoutIds = [];
        this.#clipboardManager = null;
        this.#keyboard = null;
    }

    _pressRelease(...keys) {
        for (const key of keys)
            this.#keyboard.press(key);
        for (let i = keys.length - 1; i >= 0; i--)
            this.#keyboard.release(keys[i]);
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
