/**
 * stringListManager - ExpanderRow manager for a strv preference.
 *
 * Owns the row counter, the add-button sensitivity, and the app-picker
 * popover so Settings stays declarative. Instantiated once per list
 * setting (excluded apps, terminal apps, ...).
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export class StringListManager {
    #schema;
    #field;
    #inputPlaceholder;
    #expanderRow;
    #addButton;
    #autoExpand;
    #counter = 0;

    constructor(schema, expanderRow, addButton, field, inputPlaceholder,
        { autoExpand = true } = {}) {
        this.#schema = schema;
        this.#expanderRow = expanderRow;
        this.#addButton = addButton;
        this.#field = field;
        this.#inputPlaceholder = inputPlaceholder;
        this.#autoExpand = autoExpand;
        this.#addButton.connect('clicked', () => this.openInputRow());
    }

    load() {
        const apps = this.#readList();
        for (const app of apps)
            this.#expanderRow.add_row(this.#createAppRow(app));
        this.#setCounter(apps.length);
    }

    openInputRow() {
        this.#addButton.set_sensitive(false);
        this.#setCounter(this.#counter + 1);
        this.#expanderRow.set_expanded(true);
        this.#expanderRow.add_row(this.#createInputRow());
    }

    #setCounter(value) {
        this.#counter = value;
        const hasApps = this.#counter > 0;
        this.#expanderRow.set_enable_expansion(hasApps);
        // autoExpand=false (e.g. the pre-filled terminal list) stays
        // collapsed on load; adding via the + button still expands
        // through openInputRow() so the input row is visible.
        this.#expanderRow.set_expanded(hasApps && this.#autoExpand);
    }

    #readList() {
        return this.#schema.get_strv(this.#field);
    }

    #writeList(list) {
        this.#schema.set_strv(this.#field, list);
    }

    #createAppRow(appClassName) {
        const row = new Adw.ActionRow({ title: appClassName });
        const removeButton = new Gtk.Button({
            cssClasses: ['destructive-action'],
            iconName: 'edit-delete-symbolic',
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });
        removeButton.connect('clicked', () => {
            this.#expanderRow.remove(row);
            this.#writeList(this.#readList().filter(app => app !== appClassName));
            this.#setCounter(this.#counter - 1);
        });
        row.add_suffix(removeButton);
        return row;
    }

    #createInputRow() {
        const entryRow = new Adw.ActionRow({ hexpand: false });

        const entry = new Gtk.Entry({
            placeholderText: this.#inputPlaceholder,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        const appButton = new Gtk.MenuButton({
            iconName: 'view-list-symbolic',
            cssClasses: ['flat'],
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
            tooltip_text: _('Choose from installed applications'),
        });

        const popover = new Gtk.Popover();
        const popoverBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });
        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: _('Search applications...'),
            margin_bottom: 6,
        });
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            height_request: 300,
            width_request: 300,
        });
        const listBox = new Gtk.ListBox();

        popoverBox.append(searchEntry);
        popoverBox.append(scrolledWindow);
        scrolledWindow.set_child(listBox);
        popover.set_child(popoverBox);
        appButton.set_popover(popover);

        const appRows = [];
        Gio.AppInfo.get_all()
            .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()))
            .forEach(appInfo => {
                if (!appInfo.should_show())
                    return;
                const row = new Gtk.ListBoxRow();
                const box = new Gtk.Box({
                    orientation: Gtk.Orientation.HORIZONTAL,
                    spacing: 10,
                    margin_top: 6,
                    margin_bottom: 6,
                    margin_start: 6,
                    margin_end: 6,
                });
                const icon = appInfo.get_icon();
                if (icon) {
                    box.append(new Gtk.Image({ gicon: icon, pixel_size: 24 }));
                }
                box.append(new Gtk.Label({
                    label: appInfo.get_display_name(),
                    halign: Gtk.Align.START,
                    hexpand: true,
                }));
                row.set_child(box);
                row.appInfo = appInfo;
                listBox.append(row);
                appRows.push({ row, appInfo });
            });

        searchEntry.connect('search-changed', () => {
            const text = searchEntry.get_text().toLowerCase();
            for (const { row, appInfo } of appRows)
                row.set_visible(appInfo.get_display_name().toLowerCase().includes(text));
        });
        searchEntry.connect('activate', () => {
            const first = appRows.find(({ row }) => row.visible);
            if (first)
                listBox.emit('row-activated', first.row);
            entry.grab_focus();
        });
        listBox.connect('row-activated', (_list, row) => {
            if (row?.appInfo) {
                entry.set_text(row.appInfo.get_id().replace(/\.desktop$/, ''));
                popover.popdown();
            }
        });

        const okButton = new Gtk.Button({
            iconName: 'object-select-symbolic',
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
            cssClasses: ['flat'],
        });
        const cancelButton = new Gtk.Button({
            iconName: 'window-close-symbolic',
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
            cssClasses: ['flat'],
        });

        const finishInput = commit => {
            this.#expanderRow.remove(entryRow);
            this.#addButton.set_sensitive(true);
            if (commit) {
                const text = entry.get_text()?.trim() ?? '';
                if (text !== '') {
                    this.#expanderRow.add_row(this.#createAppRow(text));
                    this.#writeList([...this.#readList(), text]);
                } else {
                    this.#setCounter(this.#counter - 1);
                }
            } else {
                this.#setCounter(this.#counter - 1);
            }
        };

        entry.connect('activate', () => finishInput(true));
        okButton.connect('clicked', () => finishInput(true));
        cancelButton.connect('clicked', () => finishInput(false));

        // Hide the ActionRow's default title children; we use prefix/suffix.
        let child = entryRow.child?.get_first_child?.() ?? null;
        while (child) {
            child.visible = false;
            child = child.get_next_sibling();
        }

        entryRow.add_prefix(entry);
        entryRow.add_suffix(appButton);
        entryRow.add_suffix(okButton);
        entryRow.add_suffix(cancelButton);

        return entryRow;
    }
}
