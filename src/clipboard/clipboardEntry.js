import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { error } from '../common/logger.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

const FileQueryInfoFlags = Gio.FileQueryInfoFlags;
const FileTest = GLib.FileTest;

export class ClipboardEntry {
    #mimetype;
    #bytes;
    #favorite;

    static #isTextMimetype(mimetype) {
        return mimetype.startsWith('text/') ||
            mimetype === 'STRING' ||
            mimetype === 'UTF8_STRING';
    }

    static isTextMimetype(mimetype) {
        return ClipboardEntry.#isTextMimetype(mimetype);
    }

    static canonicalPlainTextMimetype = 'text/plain;charset=utf-8';

    static isPlainTextMimetype(mimetype) {
        return mimetype === 'text/plain' ||
            mimetype.startsWith('text/plain;') ||
            mimetype === 'STRING' ||
            mimetype === 'UTF8_STRING' ||
            mimetype === ClipboardEntry.canonicalPlainTextMimetype;
    }

    static canonicalizeMimetype(mimetype) {
        if (ClipboardEntry.isPlainTextMimetype(mimetype))
            return ClipboardEntry.canonicalPlainTextMimetype;
        return mimetype;
    }

    static async fromJSON(jsonEntry) {
        try {
            const mimetype = jsonEntry.mimetype || 'text/plain;charset=utf-8';
            const favorite = !!jsonEntry.favorite;
            let bytes;

            if (ClipboardEntry.#isTextMimetype(mimetype)) {
                bytes = new TextEncoder().encode(jsonEntry.contents ?? '');
            } else {
                const filename = jsonEntry.contents;
                if (!filename || !GLib.file_test(filename, FileTest.EXISTS))
                    return null;

                const file = Gio.file_new_for_path(filename);
                try {
                    // promisified resolves to [data, etag] — no success flag
                    [bytes] = await file.load_contents_async(null);
                    if (!bytes)
                        throw new Error('could not read image file from cache');
                } catch (e) {
                    error('could not read cached image, skipping', e);
                    return null;
                }
            }

            return new ClipboardEntry(mimetype, bytes, favorite);
        } catch (e) {
            error('corrupt registry entry, skipping', e);
            return null;
        }
    }

    constructor(mimetype, bytes, favorite) {
        this.#mimetype = ClipboardEntry.canonicalizeMimetype(mimetype);
        // copy so callers can't mutate us
        this.#bytes = bytes instanceof Uint8Array ? bytes.slice() : bytes;
        this.#favorite = !!favorite;
    }

    toJSON() {
        return {
            favorite: this.isFavorite(),
            mimetype: this.mimetype(),
            // Text inline; images resolved to filenames by Registry.
            contents: this.isText() ? this.getStringValue() : undefined,
        };
    }

    getStringValue() {
        if (this.isImage()) {
            return `[Image ${this.checksum()}]`;
        }
        return new TextDecoder().decode(this.#bytes);
    }

    mimetype() {
        return this.#mimetype;
    }

    normalizedMimetype() {
        return ClipboardEntry.canonicalizeMimetype(this.#mimetype);
    }

    isFavorite() {
        return this.#favorite;
    }

    set favorite(val) {
        this.#favorite = !!val;
    }

    isText() {
        return ClipboardEntry.#isTextMimetype(this.#mimetype);
    }

    isImage() {
        return this.#mimetype.startsWith('image/');
    }

    rawBytes() {
        return this.#bytes.slice();
    }

    asBytes() {
        return GLib.Bytes.new(this.#bytes);
    }

    // doubles as image filename + label
    checksum() {
        return GLib.compute_checksum_for_bytes(
            GLib.ChecksumType.SHA256, this.asBytes());
    }

    equals(otherEntry) {
        if (!(otherEntry instanceof ClipboardEntry))
            return false;
        if (this.normalizedMimetype() !== otherEntry.normalizedMimetype())
            return false;
        return this.asBytes().equal(otherEntry.asBytes());
    }
}
