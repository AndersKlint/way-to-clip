import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { CLIPBOARD_MIMETYPES } from '../common/constants.js';
import { ClipboardEntry } from './clipboardEntry.js';
import { error } from '../common/logger.js';

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

/**
 * Watches the system clipboard and reports fresh copies. Own writes go through inhibit() so pastes don't echo back as new.
 */
export class ClipboardManager {
    #clipboard;
    #registry;
    #selection = null;
    #selectionOwnerChangedId = 0;
    #refreshInProgress = false;
    #inhibitCount = 0;
    #isPrivateMode = () => false;
    #isExcludedApp = () => false;
    #shouldCacheImages = () => true;

    constructor(deps) {
        this.#clipboard = deps.clipboard;
        this.#registry = deps.registry;
        if (deps.isPrivateMode)
            this.#isPrivateMode = deps.isPrivateMode;
        if (deps.isExcludedApp)
            this.#isExcludedApp = deps.isExcludedApp;
        if (deps.shouldCacheImages)
            this.#shouldCacheImages = deps.shouldCacheImages;
        this.onNewEntry = deps.onNewEntry ?? (() => {});
        this.onDuplicateEntry = deps.onDuplicateEntry ?? (() => {});
    }

    // mute the watcher while we write the clipboard ourselves, or each paste looks like a fresh copy causing a loop. Returned fn unmutes.
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
        if (this.#selectionOwnerChangedId && this.#selection)
            this.#selection.disconnect(this.#selectionOwnerChangedId);
        this.#selectionOwnerChangedId = 0;
        this.#selection = null;
    }

    async refresh() {
        if (this.#isPrivateMode())
            return;
        if (this.inhibited)
            return;

        const focusedWindow = Shell.Global.get().display.focusWindow;
        const wmClass = focusedWindow?.get_wm_class() ?? null;
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
                        // gnome mangles text mimetypes on 2nd copy, squish them into one
                        // https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/8233
                        let effectiveType = ClipboardEntry.canonicalizeMimetype(type);
                        // outer try can't reach in here (later tick). Without this a throw hangs the promise and refresh stays wedged.
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
                if (!this.#shouldCacheImages() && entry.isImage())
                    return null;
                if (this.#shouldCacheImages() && entry.isImage()) {
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
        this.#clipboard.set_content(CLIPBOARD_TYPE, entry.normalizedMimetype(), entry.asBytes());
    }

    clear() {
        this.#clipboard.set_text(CLIPBOARD_TYPE, '');
    }
}
