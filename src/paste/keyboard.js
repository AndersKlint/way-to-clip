import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { PasteMode } from './pasteTarget.js';

export class Keyboard {
    #device;
    #contentPurpose;
    #savedPurpose = null;

    constructor () {
        let seat = Clutter.get_default_backend().get_default_seat();
        this.#device = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);

        Main.inputMethod.connectObject('notify::content-purpose', (method) => {
            this.#contentPurpose = method.content_purpose;
        }, this);
    }

    destroy () {
        Main.inputMethod.disconnectObject(this);
        // virtual device holds a Wayland resource, leaks without this
        this.#device.run_dispose();
        this.#device = null;
    }

    #notify (key, state) {
        this.#device.notify_keyval(
            Clutter.get_current_event_time() * 1000,
            key,
            state
        );
    }

    get isPurposeTerminal() {
        return this.#contentPurpose === Clutter.InputContentPurpose.TERMINAL;
    }

    // grab purpose now. Popup focus resets it to NORMAL later.
    savePurpose () {
        this.#savedPurpose = this.#contentPurpose;
    }

    get isSavedPurposeTerminal() {
        return this.#savedPurpose === Clutter.InputContentPurpose.TERMINAL;
    }

    press (key) {
        this.#notify(key, Clutter.KeyState.PRESSED);
    }

    release (key) {
        this.#notify(key, Clutter.KeyState.RELEASED);
    }

    pressPaste (mode) {
        if (mode === PasteMode.TERMINAL)
            this._pressRelease(Clutter.KEY_Control_L, Clutter.KEY_Shift_L, Clutter.KEY_v);
        else
            this._pressRelease(Clutter.KEY_Control_L, Clutter.KEY_v);
    }

    _pressRelease (...keys) {
        for (const key of keys)
            this.press(key);
        for (let i = keys.length - 1; i >= 0; i--)
            this.release(keys[i]);
    }
}
