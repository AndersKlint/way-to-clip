/**
 * ClipboardManager - clipboard monitoring + read/write.
 *
 * Extracted from WayToClip._setupListener/_refreshIndicator/
 * #getClipboardContent/#updateClipboard/#clearClipboard.
 * Emits new clipboard entries via onNewEntry callback; the Indicator
 * owns history/menus. An inhibit counter implements the auto-paste
 * suppression that the old `preventIndicatorUpdate` flag never wired up.
 */

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { CLIPBOARD_MIMETYPES } from '../constants.js';
import { ClipboardEntry } from './clipboardEntry.js';
import { error } from './logger.js';

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

export class ClipboardManager {
    #clipboard;
    #registry;
    #selection = null;
    #selectionOwnerChangedId = 0;
    #refreshInProgress = false;
    #inhibitCount = 0;
    #isPrivateMode = () => false;
    #isExcludedApp = () => false;
    #cacheImages = () => true;

    /**
     * @param {object} deps
     * @param {St.Clipboard} deps.clipboard
     * @param {Registry} deps.registry
     * @param {function(): boolean} deps.isPrivateMode
     * @param {function(string|null): boolean} deps.isExcludedApp
     * @param {function(): boolean} deps.cacheImages
     * @param {function(ClipboardEntry): void} deps.onNewEntry
     * @param {function(ClipboardEntry): void} deps.onDuplicateEntry
     */
    constructor(deps) {
        this.#clipboard = deps.clipboard;
        this.#registry = deps.registry;
        if (deps.isPrivateMode)
            this.#isPrivateMode = deps.isPrivateMode;
        if (deps.isExcludedApp)
            this.#isExcludedApp = deps.isExcludedApp;
        if (deps.cacheImages)
            this.#cacheImages = deps.cacheImages;
        this.onNewEntry = deps.onNewEntry ?? (() => {});
        this.onDuplicateEntry = deps.onDuplicateEntry ?? (() => {});
    }

    /** Temporarily ignore clipboard owner-changed events (auto-paste restore). */
    inhibit() {
        this.#inhibitCount++;
        return () => {
            this.#inhibitCount = Math.max(0, this.#inhibitCount - 1);
        };
    }

    get inhibited() {
        return this.#inhibitCount > 0;
    }

    start() {
        const metaDisplay = Shell.Global.get().get_display();
        const selection = metaDisplay.get_selection();
        this.#selection = selection;
        this.#selectionOwnerChangedId = selection.connect('owner-changed',
            (_selection, selectionType) => {
                if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD)
                    this.refresh();
            });
    }

    stop() {
        if (this.#selectionOwnerChangedId && this.#selection) {
            try {
                this.#selection.disconnect(this.#selectionOwnerChangedId);
            } catch (_e) { /* already gone */ }
        }
        this.#selectionOwnerChangedId = 0;
        this.#selection = null;
    }

    async refresh() {
        if (this.#isPrivateMode())
            return;
        if (this.inhibited)
            return;

        const focusedWindow = Shell.Global.get().display.focusWindow;
        const wmClass = focusedWindow?.get_wm_class?.() ?? null;
        if (wmClass && this.#isExcludedApp(wmClass))
            return;

        if (this.#refreshInProgress)
            return;
        this.#refreshInProgress = true;
        try {
            const result = await this.readClipboard();
            if (!result)
                return;
            const existing = this.onDuplicateEntry(result);
            if (existing)
                return;
            this.onNewEntry(result);
        } catch (e) {
            error('Failed to refresh indicator', e);
        } finally {
            this.#refreshInProgress = false;
        }
    }

    async readClipboard() {
        for (let type of CLIPBOARD_MIMETYPES) {
            const entry = await new Promise(resolve => {
                try {
                    this.#clipboard.get_content(CLIPBOARD_TYPE, type, (_cb, bytes) => {
                        if (bytes === null || bytes.get_size() === 0) {
                            resolve(null);
                            return;
                        }
                        // HACK: GNOME 2nd+ copy mangles mimetypes, see
                        // https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/8233
                        let effectiveType = type;
                        if (type === 'UTF8_STRING')
                            effectiveType = 'text/plain;charset=utf-8';
                        try {
                            const result = new ClipboardEntry(
                                effectiveType, bytes.get_data(), false);
                            resolve(result);
                        } catch (e) {
                            error('Failed to decode clipboard bytes', e);
                            resolve(null);
                        }
                    });
                } catch (e) {
                    error('Clipboard read failed for ' + type, e);
                    resolve(null);
                }
            });

            if (entry) {
                if (!this.#cacheImages() && entry.isImage())
                    return null;
                if (this.#cacheImages() && entry.isImage()) {
                    try {
                        await this.#registry.writeEntryFile(entry);
                    } catch (e) {
                        error('Failed to cache image', e);
                    }
                }
                return entry;
            }
        }
        return null;
    }

    writeEntry(entry) {
        this.#clipboard.set_content(CLIPBOARD_TYPE, entry.mimetype(), entry.asBytes());
    }

    clear() {
        this.#clipboard.set_text(CLIPBOARD_TYPE, '');
    }
}
