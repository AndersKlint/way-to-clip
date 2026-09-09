import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
        // run_dispose() is required here: the virtual input device created
        // via create_virtual_device() holds a server-side Wayland resource
        // that is otherwise never released when the extension is disabled.
        this.#device.run_dispose();
    }

    #notify (key, state) {
        this.#device.notify_keyval(
            Clutter.get_current_event_time() * 1000,
            key,
            state
        );
    }

    get purpose () {
        return this.#contentPurpose;
    }

    /**
     * Snapshot the current input purpose. Call while the target app
     * still has focus (before the cursor popup takes its modal grab):
     * opening the popup steals input-method focus and resets the live
     * content-purpose to NORMAL, so reading purpose at paste time
     * misdetects terminals as plain text fields.
     */
    savePurpose () {
        this.#savedPurpose = this.#contentPurpose;
    }

    /**
     * Purpose saved by savePurpose(), or null when never saved.
     * AutoPaster consults this alongside the live purpose.
     */
    get savedPurpose () {
        return this.#savedPurpose;
    }

    press (key) {
        this.#notify(key, Clutter.KeyState.PRESSED);
    }

    release (key) {
        this.#notify(key, Clutter.KeyState.RELEASED);
    }
}
