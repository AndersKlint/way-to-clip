import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import { PrefsFields } from './constants.js';
import { ClipboardEntry } from './src/clipboardEntry.js';

// Re-export so existing `from './registry.js'` imports keep working
// while new code imports from './src/clipboardEntry.js' directly.
export { ClipboardEntry };

const FileQueryInfoFlags = Gio.FileQueryInfoFlags;
const FileCopyFlags = Gio.FileCopyFlags;
const FileTest = GLib.FileTest;

const IMAGE_EXTENSIONS = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
};

function extensionFor(mimetype) {
    return IMAGE_EXTENSIONS[mimetype] ?? '.bin';
}

export class Registry {
    constructor({ settings, uuid }) {
        // Accept either Gio.Settings or SettingsManager (which exposes .gio).
        this.settings = settings?.gio ?? settings;
        this.uuid = uuid;
        this.REGISTRY_FILE = 'registry.txt';
        this.REGISTRY_DIR = GLib.get_user_cache_dir() + '/' + this.uuid;
        this.REGISTRY_PATH = this.REGISTRY_DIR + '/' + this.REGISTRY_FILE;
        this.BACKUP_REGISTRY_PATH = this.REGISTRY_PATH + '~';

        // Serialized, coalesced write queue: many synchronous
        // _updateCache() calls collapse into one disk write.
        this._pendingEntries = null;
        this._writeInFlight = false;
        this._writeScheduled = false;
    }

    /**
     * Persist entries. Coalesced: rapid successive calls result in a
     * single write of the latest snapshot. Fire-and-forget (async).
     */
    write(entries) {
        this._pendingEntries = [...entries];
        if (this._writeInFlight) {
            this._writeScheduled = true;
            return;
        }
        this._flushWriteQueue();
    }

    /** Synchronous snapshot builder shared by write paths. */
    _buildRegistryContent(entries) {
        const registryContent = [];
        for (const entry of entries) {
            const item = {
                favorite: entry.isFavorite(),
                mimetype: entry.mimetype(),
            };
            if (entry.isText()) {
                item.contents = entry.getStringValue();
            } else if (entry.isImage()) {
                item.contents = this.getEntryFilename(entry);
                // Best-effort: image bytes are already in memory; the
                // file write runs async and must not block the snapshot.
                this.writeEntryFile(entry).catch(e =>
                    console.error('WayToClip: failed to cache image file', e));
            } else {
                // Unknown binary type: skip rather than corrupt the cache.
                continue;
            }
            registryContent.push(item);
        }
        return registryContent;
    }

    async _flushWriteQueue() {
        if (!this._pendingEntries) {
            this._writeInFlight = false;
            return;
        }
        this._writeInFlight = true;
        const entries = this._pendingEntries;
        this._pendingEntries = null;
        try {
            const registryContent = this._buildRegistryContent(entries);
            await this.writeToFile(registryContent);
        } catch (e) {
            console.error('WayToClip: failed to write registry', e);
        } finally {
            this._writeInFlight = false;
            if (this._writeScheduled) {
                this._writeScheduled = false;
                this._flushWriteQueue();
            }
        }
    }

    /**
     * Atomic write: tmp file + rename. Returns a promise; never throws
     * synchronously. Errors reject so callers can log once.
     */
    writeToFile(registry) {
        return new Promise((resolve, reject) => {
            let json;
            try {
                json = JSON.stringify(registry);
            } catch (e) {
                reject(e);
                return;
            }
            const contents = new TextEncoder().encode(json);

            try {
                GLib.mkdir_with_parents(this.REGISTRY_DIR, parseInt('0775', 8));
            } catch (e) {
                reject(e);
                return;
            }

            const tmpPath = this.REGISTRY_PATH + '.tmp';
            const tmpFile = Gio.file_new_for_path(tmpPath);
            const destFile = Gio.file_new_for_path(this.REGISTRY_PATH);

            tmpFile.replace_async(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION,
                GLib.PRIORITY_DEFAULT, null, (obj, res) => {
                    let stream;
                    try {
                        stream = obj.replace_finish(res);
                    } catch (e) {
                        reject(e);
                        return;
                    }
                    stream.write_bytes_async(new GLib.Bytes(contents),
                        GLib.PRIORITY_DEFAULT, null, (wObj, wRes) => {
                            try {
                                wObj.write_bytes_finish(wRes);
                            } catch (e) {
                                try { stream.close(null); } catch (_ignored) {}
                                reject(e);
                                return;
                            }
                            try {
                                stream.close(null);
                            } catch (e) {
                                reject(e);
                                return;
                            }
                            // Atomic publish: tmp -> registry.txt
                            try {
                                tmpFile.move(destFile, FileCopyFlags.OVERWRITE, null, null);
                            } catch (e) {
                                reject(e);
                                return;
                            }
                            resolve();
                        });
                });
        });
    }

    async read() {
        try {
            if (!GLib.file_test(this.REGISTRY_PATH, FileTest.EXISTS))
                return [];

            const file = Gio.file_new_for_path(this.REGISTRY_PATH);
            const cacheFileSizeMb = this.settings.get_int(PrefsFields.CACHE_FILE_SIZE);

            const fileInfo = await new Promise((resolve, reject) => {
                file.query_info_async('standard::size',
                    FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (src, res) => {
                        try {
                            resolve(src.query_info_finish(res));
                        } catch (e) {
                            reject(e);
                        }
                    });
            });

            if (fileInfo.get_size() >= cacheFileSizeMb * 1024 * 1024) {
                try {
                    const destination = Gio.file_new_for_path(this.BACKUP_REGISTRY_PATH);
                    file.move(destination, FileCopyFlags.OVERWRITE, null, null);
                } catch (e) {
                    console.error('WayToClip: failed to back up oversized registry', e);
                }
                return [];
            }

            const contents = await new Promise(resolve => {
                file.load_contents_async(null, (obj, res) => {
                    try {
                        const [success, data] = obj.load_contents_finish(res);
                        resolve(success ? data : null);
                    } catch (e) {
                        console.error('WayToClip: failed to read registry file', e);
                        resolve(null);
                    }
                });
            });

            if (!contents)
                return [];

            let parsed;
            try {
                parsed = JSON.parse(new TextDecoder().decode(contents));
            } catch (e) {
                console.error('WayToClip: corrupt registry JSON, starting fresh', e);
                return [];
            }
            if (!Array.isArray(parsed))
                return [];

            const maxSize = this.settings.get_int(PrefsFields.HISTORY_SIZE);
            let clipboardEntries;
            try {
                clipboardEntries = (await Promise.all(
                    parsed.map(jsonEntry => ClipboardEntry.fromJSON(jsonEntry))
                )).filter(entry => entry !== null);
            } catch (e) {
                console.error('WayToClip: failed to decode registry entries', e);
                return [];
            }

            // Trim oldest non-favorites to history-size.
            let registryNoFavorite = clipboardEntries.filter(entry => !entry.isFavorite());
            while (registryNoFavorite.length > maxSize) {
                const oldestNoFavorite = registryNoFavorite.shift();
                const itemIdx = clipboardEntries.indexOf(oldestNoFavorite);
                if (itemIdx >= 0)
                    clipboardEntries.splice(itemIdx, 1);
                else
                    registryNoFavorite = clipboardEntries.filter(entry => !entry.isFavorite());
            }

            return clipboardEntries;
        } catch (e) {
            console.error('WayToClip: failed to open registry file', e);
            return [];
        }
    }

    #entryFileExists(entry) {
        const filename = this.getEntryFilename(entry);
        return GLib.file_test(filename, FileTest.EXISTS);
    }

    async getEntryAsImage(entry) {
        if (entry.isImage() === false)
            return null;

        if (this.#entryFileExists(entry) === false) {
            try {
                await this.writeEntryFile(entry);
            } catch (e) {
                console.error('WayToClip: failed to materialize image file', e);
                return null;
            }
        }

        const gicon = Gio.icon_new_for_string(this.getEntryFilename(entry));
        return new St.Icon({ gicon });
    }

    getEntryFilename(entry) {
        return `${this.REGISTRY_DIR}/${entry.checksum()}${extensionFor(entry.mimetype())}`;
    }

    async writeEntryFile(entry) {
        if (this.#entryFileExists(entry))
            return;

        GLib.mkdir_with_parents(this.REGISTRY_DIR, parseInt('0775', 8));
        const file = Gio.file_new_for_path(this.getEntryFilename(entry));

        return new Promise((resolve, reject) => {
            file.replace_async(null, false, Gio.FileCreateFlags.NONE,
                GLib.PRIORITY_DEFAULT, null, (obj, res) => {
                    let stream;
                    try {
                        stream = obj.replace_finish(res);
                    } catch (e) {
                        reject(e);
                        return;
                    }
                    stream.write_bytes_async(entry.asBytes(), GLib.PRIORITY_DEFAULT,
                        null, (wObj, wRes) => {
                            try {
                                wObj.write_bytes_finish(wRes);
                                stream.close(null);
                                resolve();
                            } catch (e) {
                                try { stream.close(null); } catch (_ignored) {}
                                reject(e);
                            }
                        });
                });
        });
    }

    async deleteEntryFile(entry) {
        const file = Gio.file_new_for_path(this.getEntryFilename(entry));
        try {
            await file.delete_async(GLib.PRIORITY_DEFAULT, null);
        } catch (e) {
            // Missing file after a move/clear race is not an error.
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                console.error('WayToClip: failed to delete cached image', e);
        }
    }

    clearCacheFolder() {
        try {
            const folder = Gio.file_new_for_path(this.REGISTRY_DIR);
            if (!GLib.file_test(this.REGISTRY_DIR, FileTest.EXISTS | FileTest.IS_DIR))
                return;
            const enumerator = folder.enumerate_children(
                'standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const child = enumerator.get_child(info);
                try {
                    child.delete(null);
                } catch (e) {
                    console.error('WayToClip: failed to delete cache file', e);
                }
            }
            try { enumerator.close(null); } catch (_e) { /* ignore */ }
        } catch (e) {
            console.error('WayToClip: failed to clear cache folder', e);
        }
    }
}
