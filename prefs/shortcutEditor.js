import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {gettext as nativeGettext} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {makeTranslator} from '../src/common/i18n.js';

const _ = makeTranslator(nativeGettext);

const ShortcutEditor = GObject.registerClass(
class ShortcutEditor extends Gtk.Box {
    _init(schema, pref) {
        super._init({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            hexpand: true,
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
        });
        this._schema = schema;
        this._pref = pref;
        this._pendingShortcut = null;

        const chips = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
        });
        this._chips = chips;
        this.append(chips);

        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Add shortcut'),
        });
        this._addButton = addButton;
        this.append(addButton);

        this._captureController = null;

        addButton.connect('clicked', () => {
            if (this._captureController) {
                this._stopCapture();
                return;
            }

            addButton.set_icon_name('window-close-symbolic');
            addButton.set_tooltip_text(_('Cancel'));
            const captureChip = new Gtk.Box({
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
            this._captureController = eventController;
            addButton.add_controller(eventController);

            eventController.connect('key-pressed',
                (_ec, keyval, keycode, mask) => {
                    mask &= Gtk.accelerator_get_default_mod_mask();

                    if (mask === 0) {
                        if (keyval === Gdk.KEY_Escape ||
                            keyval === Gdk.KEY_BackSpace) {
                            this._stopCapture();
                            return Gdk.EVENT_STOP;
                        }
                    }

                    this._pendingShortcut = Gtk.accelerator_name_with_keycode(
                        null, keyval, keycode, mask);

                    return Gdk.EVENT_STOP;
                });

            eventController.connect('key-released',
                (_ec, keyval, keycode, state) => {
                    let releasedShortcut = this._pendingShortcut;
                    if (!releasedShortcut) {
                        state &= Gtk.accelerator_get_default_mod_mask();
                        if (state === 0) {
                            if (keyval === Gdk.KEY_Escape ||
                                keyval === Gdk.KEY_BackSpace)
                                return Gdk.EVENT_STOP;
                        }
                        releasedShortcut = Gtk.accelerator_name_with_keycode(
                            null, keyval, keycode, state);
                    }
                    if (!releasedShortcut)
                        return Gdk.EVENT_STOP;

                    const current = this._getAccels();
                    if (!current.includes(releasedShortcut))
                        schema.set_strv(pref, [...current, releasedShortcut]);
                    this._stopCapture();

                    return Gdk.EVENT_STOP;
                });

            this.show();
        });

        // re-render on outside edits (dconf)
        this._externalChangedId = schema.connect(`changed::${pref}`,
            () => this._render());

        this._render();
    }

    destroy() {
        this._pendingShortcut = null;
        if (this._captureController) {
            this._addButton.remove_controller(this._captureController);
            this._captureController = null;
        }
        if (this._schema && this._externalChangedId) {
            this._schema.disconnect(this._externalChangedId);
            this._externalChangedId = 0;
        }
        this._schema = null;
        super.destroy();
    }

    _getAccels() {
        const list = this._schema.get_strv(this._pref);
        return Array.isArray(list) ? list : [];
    }

    _clearChips() {
        let child = this._chips.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._chips.remove(child);
            child = next;
        }
    }

    _createChip(accel) {
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
            this._schema.set_strv(this._pref,
                this._getAccels().filter(a => a !== accel));
            this._render();
        });
        chip.append(removeButton);
        return chip;
    }

    _render() {
        if (this._captureController)
            return;
        this._clearChips();
        const accels = this._getAccels();
        if (accels.length === 0) {
            this._chips.append(new Gtk.Label({
                label: _('Disabled'),
                css_classes: ['dim-label'],
                valign: Gtk.Align.CENTER,
            }));
            return;
        }
        for (const accel of accels)
            this._chips.append(this._createChip(accel));
    }

    _stopCapture() {
        this._pendingShortcut = null;
        if (this._captureController) {
            this._addButton.remove_controller(this._captureController);
            this._captureController = null;
        }
        this._addButton.set_icon_name('list-add-symbolic');
        this._addButton.set_tooltip_text(_('Add shortcut'));
        this._render();
    }

    focusAddButton() {
        this._addButton.grab_focus();
    }
});

export function createShortcutEditor(schema, pref) {
    return new ShortcutEditor(schema, pref);
}
