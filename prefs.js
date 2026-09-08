import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { PrefsFields } from './constants.js';
import { createShortcutButton } from './prefs/shortcutRow.js';
import { StringListManager } from './prefs/stringListManager.js';

export default class WayToClipPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();
        const settingsUI = new Settings(window._settings);
        const page = new Adw.PreferencesPage();
        page.add(settingsUI.popup);
        page.add(settingsUI.behavior);
        page.add(settingsUI.search);
        page.add(settingsUI.limits);
        page.add(settingsUI.exclusion);
        page.add(settingsUI.shortcuts);
        window.add(page);
    }
}

class Settings {
    constructor(schema) {
        this.schema = schema;

        this.field_size = new Adw.SpinRow({
            title: _('History Size'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 10000,
                step_increment: 1,
            }),
        });

        this.field_cache_size = new Adw.SpinRow({
            title: _('Max cache file size (MB)'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 1024,
                step_increment: 1,
            }),
        });

        this.field_cache_disable = new Adw.SwitchRow({
            title: _('Cache only pinned items'),
        });

        this.field_confirm_clear_toggle = new Adw.SwitchRow({
            title: _('Show confirmation on Clear History'),
        });

        this.field_move_item_first = new Adw.SwitchRow({
            title: _('Move item to the top after selection'),
        });

        this.field_keep_selected_on_clear = new Adw.SwitchRow({
            title: _('Keep selected entry after Clear History'),
        });

        this.field_clear_on_boot = new Adw.SwitchRow({
            title: _('Clear clipboard history on system reboot'),
        });

        this.field_auto_paste = new Adw.SwitchRow({
            title: _('Auto-paste on selection'),
            subtitle: _('Automatically paste after selecting an item from the popup'),
        });

        this.field_popup_position_mode = new Adw.ComboRow({
            title: _('Popup position'),
            subtitle: _('Where to show the clipboard popup'),
            model: this.#createPopupPositionOptions(),
        });

        this.field_limit_popup_pages = new Adw.SwitchRow({
            title: _('Limit number of pages'),
            subtitle: _('When off, the popup shows the full clipboard history'),
        });

        this.field_popup_pages = new Adw.SpinRow({
            title: _('Number of pages'),
            subtitle: _('Each page shows 10 items (Tab to navigate pages)'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 11,
                step_increment: 1,
            }),
        });

        this.field_cache_images = new Adw.SwitchRow({
            title: _('Cache images'),
            active: true,
        });

        this.field_exclusion_row = new Adw.ExpanderRow({
            title: _('Excluded Apps'),
            subtitle: _('Content copied will not be saved while these apps are in focus'),
        });

        this.field_exclusion_row_add_button = new Gtk.Button({
            iconName: 'list-add-symbolic',
            cssClasses: ['flat'],
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });
        this.field_exclusion_row.add_suffix(this.field_exclusion_row_add_button);

        this.field_terminal_row = new Adw.ExpanderRow({
            title: _('Terminal Apps'),
            subtitle: _('Auto-paste uses Ctrl+Shift+V in terminals. Add your terminal if pasting inserts the wrong text'),
        });

        this.field_terminal_row_add_button = new Gtk.Button({
            iconName: 'list-add-symbolic',
            cssClasses: ['flat'],
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });
        this.field_terminal_row.add_suffix(this.field_terminal_row_add_button);

        this.case_sensitive_search = new Adw.SwitchRow({
            title: _('Case-sensitive search'),
        });

        this.regex_search = new Adw.SwitchRow({
            title: _('Regular expression matching in search'),
        });

        this.field_clear_history_on_interval = new Adw.SwitchRow({
            title: _('Clear clipboard history on interval'),
        });

        this.field_clear_history_interval = new Adw.SpinRow({
            title: _('History clear interval (in minutes)'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 1440,
                step_increment: 10,
            }),
        });

        this.field_clear_history_on_interval.connect('notify::active', widget => {
            this.field_clear_history_interval.set_sensitive(widget.active);
        });

        this.field_limit_popup_pages.connect('notify::active', widget => {
            this.field_popup_pages.set_sensitive(widget.active);
        });

        this.popup = new Adw.PreferencesGroup({ title: _('Popup') });
        this.behavior = new Adw.PreferencesGroup({ title: _('Behavior') });
        this.exclusion = new Adw.PreferencesGroup({ title: _('Exclusion') });
        this.limits = new Adw.PreferencesGroup({ title: _('Limits') });
        this.shortcuts = new Adw.PreferencesGroup({ title: _('Shortcuts') });
        this.search = new Adw.PreferencesGroup({ title: _('Search') });

        this.popup.add(this.field_popup_position_mode);
        this.popup.add(this.field_limit_popup_pages);
        this.popup.add(this.field_popup_pages);

        this.behavior.add(this.field_auto_paste);
        this.behavior.add(this.field_terminal_row);
        this.behavior.add(this.field_move_item_first);
        this.behavior.add(this.field_keep_selected_on_clear);
        this.behavior.add(this.field_cache_images);
        this.behavior.add(this.field_clear_on_boot);
        this.behavior.add(this.field_clear_history_on_interval);
        this.behavior.add(this.field_clear_history_interval);
        this.behavior.add(this.field_confirm_clear_toggle);

        // NOTE: the add-button lives only as the ExpanderRow suffix.
        // (The old code also added it as a group child, which reparented
        // it away from the row.)
        this.exclusion.add(this.field_exclusion_row);

        this.limits.add(this.field_size);
        this.limits.add(this.field_cache_size);
        this.limits.add(this.field_cache_disable);

        this.search.add(this.case_sensitive_search);
        this.search.add(this.regex_search);

        this.#buildShorcuts(this.shortcuts);

        this.schema.bind(PrefsFields.HISTORY_SIZE, this.field_size, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CACHE_FILE_SIZE, this.field_cache_size, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CACHE_ONLY_FAVORITE, this.field_cache_disable, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CONFIRM_ON_CLEAR, this.field_confirm_clear_toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.MOVE_ITEM_FIRST, this.field_move_item_first, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.KEEP_SELECTED_ON_CLEAR, this.field_keep_selected_on_clear, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.ENABLE_KEYBINDING, this.field_keybinding_activation, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CLEAR_ON_BOOT, this.field_clear_on_boot, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.AUTO_PASTE, this.field_auto_paste, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.POPUP_POSITION_MODE, this.field_popup_position_mode, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.LIMIT_POPUP_PAGES, this.field_limit_popup_pages, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.MAX_POPUP_PAGES, this.field_popup_pages, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CACHE_IMAGES, this.field_cache_images, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CLEAR_HISTORY_ON_INTERVAL, this.field_clear_history_on_interval, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CLEAR_HISTORY_INTERVAL, this.field_clear_history_interval, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CASE_SENSITIVE_SEARCH, this.case_sensitive_search, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.REGEX_SEARCH, this.regex_search, 'active', Gio.SettingsBindFlags.DEFAULT);

        this.field_clear_history_interval.set_sensitive(this.field_clear_history_on_interval.active);
        this.field_popup_pages.set_sensitive(this.field_limit_popup_pages.active);

        this.excludedApps = new StringListManager(
            this.schema,
            this.field_exclusion_row,
            this.field_exclusion_row_add_button,
            PrefsFields.EXCLUDED_APPS,
            _('Window class name, e.g. "KeePassXC"'),
        );
        this.excludedApps.load();

        this.terminalApps = new StringListManager(
            this.schema,
            this.field_terminal_row,
            this.field_terminal_row_add_button,
            PrefsFields.TERMINAL_APPS,
            _('Window class or app id, e.g. "org.gnome.Ptyxis"'),
            { autoExpand: false },
        );
        this.terminalApps.load();
    }

    #createPopupPositionOptions() {
        const liststore = new Gtk.StringList();
        liststore.append(_('At mouse cursor'));
        liststore.append(_('Center of focused window'));
        return liststore;
    }

    #shortcuts = {
        [PrefsFields.BINDING_TOGGLE_POPUP]: _('Toggle the clipboard popup'),
        [PrefsFields.BINDING_PRIVATE_MODE]: _('Private mode'),
        [PrefsFields.BINDING_CLEAR_HISTORY]: _('Clear history'),
    };

    #buildShorcuts(group) {
        this.field_keybinding_activation = new Adw.SwitchRow({
            title: _('Enable shortcuts'),
        });

        group.add(this.field_keybinding_activation);

        for (const [pref, title] of Object.entries(this.#shortcuts)) {
            const row = new Adw.ActionRow({ title });
            row.add_suffix(createShortcutButton(this.schema, pref));
            group.add(row);
        }
    }
}
