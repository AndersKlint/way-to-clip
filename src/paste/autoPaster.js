import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { decidePasteMode, PasteMode } from './pasteKeys.js';

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

        // images need a beat to land on wayland or paste hits stale stuff
        const pasteDelay = entry.isImage() ? IMAGE_PASTE_DELAY_MS : TEXT_PASTE_DELAY_MS;
        this._after(pasteDelay, () => {
            // popup grab resets purpose to NORMAL, so trust the snapshot too
            const mode = decidePasteMode(
                target,
                this.#keyboard.purpose,
                Clutter.InputContentPurpose.TERMINAL,
            );
            if (mode === PasteMode.TERMINAL) {
                this._pressRelease(
                    Clutter.KEY_Control_L, Clutter.KEY_Shift_L, Clutter.KEY_v);
            } else {
                this._pressRelease(Clutter.KEY_Control_L, Clutter.KEY_v);
            }
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
