import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import { PrefsFields } from '../common/constants.js';
import { ClipboardEntry } from '../clipboard/clipboardEntry.js';
import { error } from '../common/logger.js';

// promisified lazily in the constructor so importing the module stays side-effect free
let promisified = false;

function ensurePromisified() {
    if (promisified)
        return;
    promisified = true;
    Gio._promisify(Gio.File.prototype, 'replace_async', 'replace_finish');
    Gio._promisify(Gio.OutputStream.prototype, 'write_bytes_async', 'write_bytes_finish');
    Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
    Gio._promisify(Gio.File.prototype, 'query_info_async', 'query_info_finish');
    Gio._promisify(Gio.File.prototype, 'delete_async', 'delete_finish');
}

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
        ensurePromisified();
        this.settings = settings;
        this.uuid = uuid;
        this.REGISTRY_FILE = 'registry.txt';
        this.REGISTRY_DIR = GLib.get_user_cache_dir() + '/' + this.uuid;
        this.REGISTRY_PATH = this.REGISTRY_DIR + '/' + this.REGISTRY_FILE;
        this.BACKUP_REGISTRY_PATH = this.REGISTRY_PATH + '~';

        this._pendingEntries = null;
        this._writeInFlight = false;
        this._writeScheduled = false;
    }

    destroy() {
        this._pendingEntries = null;
        this._writeScheduled = false;
        this.settings = null;
    }

    write(entries) {
        this._pendingEntries = [...entries];
        if (this._writeInFlight) {
            this._writeScheduled = true;
            return;
        }
        this._flushWriteQueue();
    }

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
                // don't block the snapshot on the file write
                this.writeEntryFile(entry).catch(e =>
                    error('failed to cache image file', e));
            } else {
                // unknown type: skip it, don't corrupt the cache
                continue;
            }
            registryContent.push(item);
        }
        return registryContent;
    }

    async _flushWriteQueue() {
        if (!this.settings) {
            this._writeInFlight = false;
            return;
        }
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
            error('failed to write registry', e);
        } finally {
            this._writeInFlight = false;
            if (this._writeScheduled) {
                this._writeScheduled = false;
                this._flushWriteQueue();
            }
        }
    }

    // tmp file + rename so we never half-write the cache on error
    async writeToFile(registry) {
        const json = JSON.stringify(registry);
        const contents = new TextEncoder().encode(json);

        GLib.mkdir_with_parents(this.REGISTRY_DIR, 0o775);

        const tmpPath = this.REGISTRY_PATH + '.tmp';
        const tmpFile = Gio.file_new_for_path(tmpPath);
        const destFile = Gio.file_new_for_path(this.REGISTRY_PATH);

        const stream = await tmpFile.replace_async(null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, GLib.PRIORITY_DEFAULT, null);
        try {
            await stream.write_bytes_async(new GLib.Bytes(contents),
                GLib.PRIORITY_DEFAULT, null);
        } catch (e) {
            try { stream.close(null); } catch (_ignored) {}
            throw e;
        }
        try {
            stream.close(null);
        } catch (e) {
            throw e;
        }
        tmpFile.move(destFile, FileCopyFlags.OVERWRITE, null, null);
    }

    async read() {
        try {
            if (!GLib.file_test(this.REGISTRY_PATH, FileTest.EXISTS))
                return [];

            const file = Gio.file_new_for_path(this.REGISTRY_PATH);
            const cacheFileSizeMb = this.settings.get_int(PrefsFields.CACHE_FILE_SIZE);

            const fileInfo = await file.query_info_async('standard::size',
                FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);

            if (fileInfo.get_size() >= cacheFileSizeMb * 1024 * 1024) {
                try {
                    const destination = Gio.file_new_for_path(this.BACKUP_REGISTRY_PATH);
                    file.move(destination, FileCopyFlags.OVERWRITE, null, null);
                } catch (e) {
                    error('failed to back up oversized registry', e);
                }
                return [];
            }

            let contents = null;
            try {
                // promisified resolves to [data, etag]. No success flag.
                [contents] = await file.load_contents_async(null);
            } catch (e) {
                error('failed to read registry file', e);
                return [];
            }

            if (!contents)
                return [];

            let parsed;
            try {
                parsed = JSON.parse(new TextDecoder().decode(contents));
            } catch (e) {
                error('corrupt registry JSON, starting fresh', e);
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
                error('failed to decode registry entries', e);
                return [];
            }

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
            error('failed to open registry file', e);
            return [];
        }
    }

    #entryFileExists(entry) {
        const filename = this.getEntryFilename(entry);
        return GLib.file_test(filename, FileTest.EXISTS);
    }

    async getEntryAsImage(entry) {
        if (!entry.isImage())
            return null;

        if (!this.#entryFileExists(entry)) {
            try {
                await this.writeEntryFile(entry);
            } catch (e) {
                error('failed to materialize image file', e);
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

        GLib.mkdir_with_parents(this.REGISTRY_DIR, 0o775);
        const file = Gio.file_new_for_path(this.getEntryFilename(entry));

        const stream = await file.replace_async(null, false,
            Gio.FileCreateFlags.NONE, GLib.PRIORITY_DEFAULT, null);
        try {
            await stream.write_bytes_async(entry.asBytes(),
                GLib.PRIORITY_DEFAULT, null);
            stream.close(null);
        } catch (e) {
            try { stream.close(null); } catch (_ignored) {}
            throw e;
        }
    }

    async deleteEntryFile(entry) {
        const file = Gio.file_new_for_path(this.getEntryFilename(entry));
        try {
            await file.delete_async(GLib.PRIORITY_DEFAULT, null);
        } catch (e) {
            // file gone after a race is fine, ignore it
            if (e instanceof GLib.Error &&
                e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return;
            error('failed to delete cached image', e);
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
                    error('failed to delete cache file', e);
                }
            }
            try { enumerator.close(null); } catch (_e) { /* ignore */ }
        } catch (e) {
            error('failed to clear cache folder', e);
        }
    }
}
