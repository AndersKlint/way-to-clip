import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { PrefsFields } from '../common/constants.js';

const BINDINGS = [
    [PrefsFields.BINDING_CLEAR_HISTORY, 'onRequestClearHistory'],
    [PrefsFields.BINDING_TOGGLE_POPUP, 'onToggleCursorPopup'],
    [PrefsFields.BINDING_PRIVATE_MODE, 'onTogglePrivateMode'],
];

export class ShortcutManager {
    #settings;
    #handlers;
    #boundNames = [];

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
        for (const name of this.#boundNames)
            Main.wm.removeKeybinding(name);
        this.#boundNames = [];
    }

    #bindOne(name, callback) {
        Main.wm.addKeybinding(
            name,
            this.#settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
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
