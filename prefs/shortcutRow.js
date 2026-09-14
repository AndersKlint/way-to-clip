import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import { gettext as nativeGettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { makeTranslator } from '../src/common/i18n.js';

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
        this._debounceTimeoutId = 0;

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
                    if (this._debounceTimeoutId) {
                        clearTimeout(this._debounceTimeoutId);
                        this._debounceTimeoutId = 0;
                    }

                    mask &= Gtk.accelerator_get_default_mod_mask();

                    if (mask === 0) {
                        if (keyval === Gdk.KEY_Escape ||
                            keyval === Gdk.KEY_BackSpace) {
                            this._stopCapture();
                            return Gdk.EVENT_STOP;
                        }
                    }

                    const selectedShortcut = Gtk.accelerator_name_with_keycode(
                        null, keyval, keycode, mask);

                    this._debounceTimeoutId = setTimeout(() => {
                        this._debounceTimeoutId = 0;
                        const current = this._getAccels();
                        if (!current.includes(selectedShortcut))
                            schema.set_strv(pref, [...current, selectedShortcut]);
                        this._stopCapture();
                    }, 400);

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
        if (this._debounceTimeoutId) {
            clearTimeout(this._debounceTimeoutId);
            this._debounceTimeoutId = 0;
        }
        if (this._captureController) {
            this._addButton.remove_controller(this._captureController);
            this._captureController = null;
        }
        this._schema.disconnect(this._externalChangedId);
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
        if (this._debounceTimeoutId) {
            clearTimeout(this._debounceTimeoutId);
            this._debounceTimeoutId = 0;
        }
        if (this._captureController) {
            this._addButton.remove_controller(this._captureController);
            this._captureController = null;
        }
        this._addButton.set_icon_name('list-add-symbolic');
        this._addButton.set_tooltip_text(_('Add shortcut'));
        this._render();
    }
});

export function createShortcutEditor(schema, pref) {
    return new ShortcutEditor(schema, pref);
}
