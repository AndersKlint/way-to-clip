/**
 * ShortcutManager - owns global keybinding lifecycle.
 *
 * Extracted from WayToClip._bindShortcuts/_unbindShortcuts/_bindShortcut.
 * Bindings are tracked by name so disable() always removes exactly what
 * enable() added, even if settings change mid-session.
 */

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { PrefsFields } from '../constants.js';

const BINDINGS = [
    [PrefsFields.BINDING_CLEAR_HISTORY, 'handleClearHistory'],
    [PrefsFields.BINDING_TOGGLE_POPUP, 'handleTogglePopup'],
    [PrefsFields.BINDING_PRIVATE_MODE, 'handlePrivateMode'],
];

export class ShortcutManager {
    #settings;
    #handlers;
    #boundNames = [];

    /**
     * @param {Gio.Settings} settings
     * @param {object} handlers { handleClearHistory, handleTogglePopup, handlePrivateMode }
     */
    constructor(settings, handlers) {
        this.#settings = settings;
        this.#handlers = handlers;
    }

    bindAll() {
        this.unbindAll();
        for (const [name, handlerKey] of BINDINGS)
            this.#bindOne(name, this.#handlers[handlerKey]);
    }

    unbindAll() {
        for (const name of this.#boundNames) {
            try {
                Main.wm.removeKeybinding(name);
            } catch (_e) { /* never bound or already removed */ }
        }
        this.#boundNames = [];
    }

    #bindOne(name, callback) {
        if (typeof callback !== 'function')
            return;
        const ModeType = Object.prototype.hasOwnProperty.call(Shell, 'ActionMode')
            ? Shell.ActionMode
            : Shell.KeyBindingMode;
        Main.wm.addKeybinding(
            name,
            this.#settings,
            Meta.KeyBindingFlags.NONE,
            ModeType.ALL,
            callback,
        );
        this.#boundNames.push(name);
    }

    destroy() {
        this.unbindAll();
        this.#settings = null;
        this.#handlers = null;
    }
}
