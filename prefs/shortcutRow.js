/**
 * shortcutRow - capturable global-shortcut button for the prefs window.
 *
 * Extracted from prefs.js. One Gtk.EventControllerKey is created per
 * capture session and removed afterwards (the old code stacked a new
 * controller on every click). Backspace clears, Escape cancels.
 */

import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function createShortcutButton(schema, pref) {
    const button = new Gtk.Button({ has_frame: false });

    const setLabelFromSettings = () => {
        const value = schema.get_strv(pref)[0];
        button.set_label(value ? value : _('Disabled'));
    };

    const stopEditing = controller => {
        setLabelFromSettings();
        button.isEditing = null;
        if (controller) {
            try {
                button.remove_controller(controller);
            } catch (_e) { /* already removed */ }
        }
    };

    const revertEditing = controller => {
        button.set_label(button.isEditing);
        button.isEditing = null;
        if (controller) {
            try {
                button.remove_controller(controller);
            } catch (_e) { /* already removed */ }
        }
    };

    setLabelFromSettings();

    button.connect('clicked', () => {
        if (button.isEditing) {
            revertEditing(button._captureController ?? null);
            button._captureController = null;
            return;
        }

        button.isEditing = button.label;
        button.set_label(_('Enter shortcut'));

        const eventController = new Gtk.EventControllerKey();
        button._captureController = eventController;
        button.add_controller(eventController);

        let debounceTimeoutId = 0;
        const connectId = eventController.connect('key-pressed',
            (_ec, keyval, keycode, mask) => {
                if (debounceTimeoutId) {
                    clearTimeout(debounceTimeoutId);
                    debounceTimeoutId = 0;
                }

                mask &= Gtk.accelerator_get_default_mod_mask();

                if (mask === 0) {
                    if (keyval === Gdk.KEY_Escape) {
                        revertEditing(eventController);
                        button._captureController = null;
                        return Gdk.EVENT_STOP;
                    }
                    if (keyval === Gdk.KEY_BackSpace) {
                        schema.set_strv(pref, []);
                        stopEditing(eventController);
                        button._captureController = null;
                        return Gdk.EVENT_STOP;
                    }
                }

                const selectedShortcut = Gtk.accelerator_name_with_keycode(
                    null, keyval, keycode, mask);

                debounceTimeoutId = setTimeout(() => {
                    debounceTimeoutId = 0;
                    button._captureController = null;
                    schema.set_strv(pref, [selectedShortcut]);
                    stopEditing(eventController);
                }, 400);

                return Gdk.EVENT_STOP;
            });

        void connectId;
        button.show();
    });

    return button;
}
