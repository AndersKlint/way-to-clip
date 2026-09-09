/**
 * shortcutRow - multi-shortcut chip editor for the prefs window.
 *
 * Each shortcut setting (a strv of GTK accelerators) renders as a row of
 * "bubble" chips — one per accelerator — each with an x button that
 * removes just that entry, plus a + button at the far right that
 * captures and appends a new shortcut. Escape, Backspace, or a second
 * click on + cancels an ongoing capture. One Gtk.EventControllerKey is
 * created per capture session and removed afterwards.
 */

import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import { gettext as nativeGettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { translate } from '../src/i18n.js';

const _ = msgid => translate(msgid, nativeGettext);

export function createShortcutEditor(schema, pref) {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 6,
        hexpand: true,
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
    });

    // Plain Box, not FlowBox: a row holds at most a few chips, and
    // FlowBox's wrapping layout fights the ActionRow suffix allocation
    // (GtkFlowBoxChild "measured for width of 0" warning spam).
    const chips = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 6,
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
    });
    box.append(chips);

    const addButton = new Gtk.Button({
        icon_name: 'list-add-symbolic',
        css_classes: ['flat'],
        valign: Gtk.Align.CENTER,
        tooltip_text: _('Add shortcut'),
    });
    box.append(addButton);

    let captureController = null;
    let captureChip = null;
    let debounceTimeoutId = 0;

    const getAccels = () => {
        const list = schema.get_strv(pref);
        return Array.isArray(list) ? list : [];
    };

    const clearChips = () => {
        let child = chips.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            chips.remove(child);
            child = next;
        }
    };

    const createChip = accel => {
        const chip = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2,
            css_classes: ['card'],
            valign: Gtk.Align.CENTER,
        });
        chip.append(new Gtk.Label({
            label: accel,
            valign: Gtk.Align.CENTER,
            margin_start: 8,
        }));
        const removeButton = new Gtk.Button({
            icon_name: 'window-close-symbolic',
            css_classes: ['flat', 'circular'],
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Remove shortcut'),
        });
        removeButton.connect('clicked', () => {
            schema.set_strv(pref, getAccels().filter(a => a !== accel));
            render();
        });
        chip.append(removeButton);
        return chip;
    };

    const render = () => {
        if (captureController)
            return;
        clearChips();
        const accels = getAccels();
        if (accels.length === 0) {
            chips.append(new Gtk.Label({
                label: _('Disabled'),
                css_classes: ['dim-label'],
                valign: Gtk.Align.CENTER,
            }));
            return;
        }
        for (const accel of accels)
            chips.append(createChip(accel));
    };

    const stopCapture = () => {
        // Idempotent via the nulling: each controller is removed once.
        if (debounceTimeoutId) {
            clearTimeout(debounceTimeoutId);
            debounceTimeoutId = 0;
        }
        if (captureController) {
            addButton.remove_controller(captureController);
            captureController = null;
        }
        captureChip = null;
        addButton.set_icon_name('list-add-symbolic');
        addButton.set_tooltip_text(_('Add shortcut'));
        render();
    };

    addButton.connect('clicked', () => {
        // Second click while capturing cancels.
        if (captureController) {
            stopCapture();
            return;
        }

        addButton.set_icon_name('window-close-symbolic');
        addButton.set_tooltip_text(_('Cancel'));
        captureChip = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['card'],
            valign: Gtk.Align.CENTER,
        });
        captureChip.append(new Gtk.Label({
            label: _('Enter shortcut…'),
            css_classes: ['dim-label'],
            valign: Gtk.Align.CENTER,
            margin_start: 8,
            margin_end: 8,
        }));
        chips.append(captureChip);

        const eventController = new Gtk.EventControllerKey();
        captureController = eventController;
        addButton.add_controller(eventController);

        eventController.connect('key-pressed',
            (_ec, keyval, keycode, mask) => {
                if (debounceTimeoutId) {
                    clearTimeout(debounceTimeoutId);
                    debounceTimeoutId = 0;
                }

                mask &= Gtk.accelerator_get_default_mod_mask();

                if (mask === 0) {
                    if (keyval === Gdk.KEY_Escape ||
                        keyval === Gdk.KEY_BackSpace) {
                        stopCapture();
                        return Gdk.EVENT_STOP;
                    }
                }

                const selectedShortcut = Gtk.accelerator_name_with_keycode(
                    null, keyval, keycode, mask);

                debounceTimeoutId = setTimeout(() => {
                    debounceTimeoutId = 0;
                    const current = getAccels();
                    if (!current.includes(selectedShortcut))
                        schema.set_strv(pref, [...current, selectedShortcut]);
                    stopCapture();
                }, 400);

                return Gdk.EVENT_STOP;
            });

        box.show();
    });

    // Re-render on external changes (e.g. dconf edits). The schema
    // object outlives the row, so disconnect on destroy to avoid
    // pinning the widgets (and the debounce closure) afterwards.
    const externalChangedId = schema.connect(`changed::${pref}`, render);

    // Drop a pending debounced write if the prefs window closes
    // mid-capture so it can't touch destroyed widgets. (Factory
    // function, not a widget subclass, so observe destroy here.)
    box.connect('destroy', () => {
        schema.disconnect(externalChangedId);
        if (debounceTimeoutId) {
            clearTimeout(debounceTimeoutId);
            debounceTimeoutId = 0;
        }
    });

    render();

    return box;
}
