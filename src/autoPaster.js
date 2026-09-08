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

import { decidePasteMode, PasteMode } from './pasteKeys.js';

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
     * target is the PasteTarget snapshotted at popup-open time (null
     * when pasting without a prior open).
     */
    paste(entry, previouslySelectedEntry, onDone, target = null) {
        const releaseInhibit = this.#clipboardManager.inhibit();
        this.#clipboardManager.writeEntry(entry);

        this._after(50, () => {
            // The live content-purpose can't be trusted on its own: the
            // popup's modal grab resets it to NORMAL, so a terminal
            // would get Shift+Insert (PRIMARY selection) instead of the
            // chosen entry. The snapshot decides alongside it.
            const mode = decidePasteMode(
                target,
                this.#keyboard.purpose,
                Clutter.InputContentPurpose.TERMINAL,
            );
            if (mode === PasteMode.TERMINAL) {
                // Ctrl+Shift+V is the standard paste binding in
                // Ptyxis, GNOME Terminal/Console, Konsole, Alacritty,
                // Kitty, Ghostty and VS Code terminals. (Ctrl+Shift+Insert
                // is unbound by default and Shift+Insert pastes PRIMARY
                // in VTE terminals instead of the clipboard.)
                this._pressRelease(
                    Clutter.KEY_Control_L, Clutter.KEY_Shift_L, Clutter.KEY_v);
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
