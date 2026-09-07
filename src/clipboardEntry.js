/**
 * ClipboardEntry - in-memory model for one clipboard item.
 *
 * Extracted from registry.js so history logic, persistence and the
 * popup can share one definition. Depends only on GLib/Gio (no Shell).
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

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

    /**
     * Rebuild an entry from its JSON registry representation.
     * Never throws: returns null for missing/corrupt data so callers
     * can filter it out instead of hanging.
     */
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
                    bytes = await new Promise((resolve, reject) => {
                        file.load_contents_async(null, (obj, res) => {
                            try {
                                const [success, contents] = obj.load_contents_finish(res);
                                if (success)
                                    resolve(contents);
                                else
                                    reject(new Error('WayToClip: could not read image file from cache'));
                            } catch (e) {
                                reject(e);
                            }
                        });
                    });
                } catch (e) {
                    console.error('WayToClip: could not read cached image, skipping', e);
                    return null;
                }
            }

            return new ClipboardEntry(mimetype, bytes, favorite);
        } catch (e) {
            console.error('WayToClip: corrupt registry entry, skipping', e);
            return null;
        }
    }

    constructor(mimetype, bytes, favorite) {
        this.#mimetype = mimetype;
        // Store a plain Uint8Array copy so callers can't mutate us.
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

    /** Stable hex digest for filenames and image labels. */
    checksum() {
        return GLib.compute_checksum_for_bytes(
            GLib.ChecksumType.SHA256, this.asBytes());
    }

    equals(otherEntry) {
        if (!otherEntry)
            return false;
        if (this.#mimetype !== otherEntry.mimetype())
            return false;
        try {
            return this.asBytes().equal(otherEntry.asBytes());
        } catch (_e) {
            return this.getStringValue() === otherEntry.getStringValue();
        }
    }
}
