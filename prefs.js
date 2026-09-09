import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import { ExtensionPreferences, gettext as nativeGettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { PrefsFields } from './constants.js';
import { createShortcutEditor } from './prefs/shortcutRow.js';
import { StringListManager } from './prefs/stringListManager.js';
import {
    AVAILABLE_LANGUAGES,
    LANGUAGE_LABELS,
    SYSTEM_LANGUAGE,
    normalizeLanguage,
    syncOverrideFromSettings,
    translate,
} from './src/i18n.js';

const _ = msgid => translate(msgid, nativeGettext);

export default class WayToClipPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();
        syncOverrideFromSettings(window._settings);
        // Keep the override live: popups/prefs opened after a change
        // already use the new language; built rows need a reopen.
        window._settings.connect(`changed::${PrefsFields.LANGUAGE}`, () => {
            syncOverrideFromSettings(window._settings);
        });
        const settingsUI = new Settings(window._settings);
        const page = new Adw.PreferencesPage();
        page.add(settingsUI.general);
        page.add(settingsUI.popup);
        page.add(settingsUI.behavior);
        page.add(settingsUI.limits);
        page.add(settingsUI.exclusion);
        page.add(settingsUI.globalShortcuts);
        page.add(settingsUI.localShortcuts);
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

        this.field_image_preview_size = new Adw.SpinRow({
            title: _('Image thumbnail size (px)'),
            subtitle: _('Preview size for images in the popup'),
            adjustment: new Gtk.Adjustment({
                lower: 32,
                upper: 512,
                step_increment: 8,
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

        this.field_language = new Adw.ComboRow({
            title: _('Language'),
            subtitle: _('Requires reopening Settings and restarting the extension'),
            model: this.#createLanguageOptions(),
        });

        this.general = new Adw.PreferencesGroup({ title: _('General') });
        this.popup = new Adw.PreferencesGroup({ title: _('Popup') });
        this.behavior = new Adw.PreferencesGroup({ title: _('Behavior') });
        this.exclusion = new Adw.PreferencesGroup({ title: _('Exclusion') });
        this.limits = new Adw.PreferencesGroup({ title: _('Limits') });
        this.globalShortcuts = new Adw.PreferencesGroup({ title: _('Global shortcuts') });
        this.localShortcuts = new Adw.PreferencesGroup({ title: _('Popup shortcuts') });

        this.general.add(this.field_language);
        this.#bindLanguageRow();

        this.popup.add(this.field_popup_position_mode);
        this.popup.add(this.field_limit_popup_pages);
        this.popup.add(this.field_popup_pages);
        this.popup.add(this.field_image_preview_size);

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

        this.#buildGlobalShortcuts(this.globalShortcuts);
        this.#buildLocalShortcuts(this.localShortcuts);

        this.schema.bind(PrefsFields.HISTORY_SIZE, this.field_size, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CACHE_FILE_SIZE, this.field_cache_size, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CONFIRM_ON_CLEAR, this.field_confirm_clear_toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.MOVE_ITEM_FIRST, this.field_move_item_first, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.KEEP_SELECTED_ON_CLEAR, this.field_keep_selected_on_clear, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.ENABLE_KEYBINDING, this.field_keybinding_activation, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CLEAR_ON_BOOT, this.field_clear_on_boot, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.AUTO_PASTE, this.field_auto_paste, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.POPUP_POSITION_MODE, this.field_popup_position_mode, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.LIMIT_POPUP_PAGES, this.field_limit_popup_pages, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.MAX_POPUP_PAGES, this.field_popup_pages, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.IMAGE_PREVIEW_SIZE, this.field_image_preview_size, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CACHE_IMAGES, this.field_cache_images, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CLEAR_HISTORY_ON_INTERVAL, this.field_clear_history_on_interval, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.CLEAR_HISTORY_INTERVAL, this.field_clear_history_interval, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind(PrefsFields.SHOW_SHORTCUT_HINTS, this.field_show_shortcut_hints, 'active', Gio.SettingsBindFlags.DEFAULT);

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

    #createLanguageOptions() {
        const liststore = new Gtk.StringList();
        for (const code of AVAILABLE_LANGUAGES) {
            if (code === SYSTEM_LANGUAGE)
                liststore.append(_('System'));
            else
                liststore.append(LANGUAGE_LABELS[code] ?? code);
        }
        return liststore;
    }

    // GSettings stores a locale code string; ComboRow exposes an index.
    // Sync both directions (guard against feedback loops).
    #bindLanguageRow() {
        const codes = AVAILABLE_LANGUAGES;
        const readStored = () => {
            try {
                return normalizeLanguage(this.schema.get_string(PrefsFields.LANGUAGE));
            } catch (_e) {
                return SYSTEM_LANGUAGE;
            }
        };
        const applyStoredToRow = () => {
            const idx = codes.indexOf(readStored());
            if (idx >= 0 && this.field_language.selected !== idx)
                this.field_language.selected = idx;
        };
        applyStoredToRow();
        this.field_language.connect('notify::selected', () => {
            const code = codes[this.field_language.selected] ?? SYSTEM_LANGUAGE;
            if (readStored() !== code) {
                this.schema.set_string(PrefsFields.LANGUAGE, code);
                syncOverrideFromSettings(this.schema);
            }
        });
        this.schema.connect(`changed::${PrefsFields.LANGUAGE}`, applyStoredToRow);
    }

    #createPopupPositionOptions() {
        const liststore = new Gtk.StringList();
        liststore.append(_('At mouse cursor'));
        liststore.append(_('Center of focused window'));
        return liststore;
    }

    // GNOME-wide keybindings, effective even when the popup is closed.
    #globalShortcuts = {
        [PrefsFields.BINDING_TOGGLE_POPUP]: _('Toggle the clipboard popup'),
        [PrefsFields.BINDING_PRIVATE_MODE]: _('Private mode'),
        [PrefsFields.BINDING_CLEAR_HISTORY]: _('Clear history'),
    };

    // Shortcuts local to the cursor popup (effective only while it is
    // open). A setting may hold several accelerators, each rendered as
    // its own removable chip in the editor below.
    #localShortcuts = {
        [PrefsFields.LOCAL_SEARCH]: _('Search in popup'),
        [PrefsFields.LOCAL_DELETE_ENTRY]: _('Delete selected entry'),
        [PrefsFields.LOCAL_PRIVATE_MODE]: _('Toggle private mode'),
        [PrefsFields.LOCAL_PAGE_NEXT]: _('Next page'),
        [PrefsFields.LOCAL_PAGE_PREVIOUS]: _('Previous page'),
        [PrefsFields.LOCAL_MOVE_UP]: _('Move selection up'),
        [PrefsFields.LOCAL_MOVE_DOWN]: _('Move selection down'),
        [PrefsFields.LOCAL_CONFIRM]: _('Confirm selection'),
        [PrefsFields.LOCAL_CLOSE]: _('Close popup'),
        [PrefsFields.LOCAL_CASE_SENSITIVE]: _('Match case (while searching)'),
        [PrefsFields.LOCAL_REGEX_SEARCH]: _('Use regular expression (while searching)'),
    };

    #addShortcutRows(group, shortcuts) {
        for (const [pref, title] of Object.entries(shortcuts)) {
            const row = new Adw.ActionRow({ title });
            row.add_suffix(createShortcutEditor(this.schema, pref));
            group.add(row);
        }
    }

    #buildGlobalShortcuts(group) {
        this.field_keybinding_activation = new Adw.SwitchRow({
            title: _('Enable shortcuts'),
        });

        group.add(this.field_keybinding_activation);
        this.#addShortcutRows(group, this.#globalShortcuts);
        this.#addResetRow(group, this.#globalShortcuts);
    }

    #buildLocalShortcuts(group) {
        this.field_show_shortcut_hints = new Adw.SwitchRow({
            title: _('Show shortcut reminder icons'),
            subtitle: _('Show the shortcut reminder icons at the bottom of the popup'),
        });

        group.add(this.field_show_shortcut_hints);
        this.#addShortcutRows(group, this.#localShortcuts);
        this.#addResetRow(group, this.#localShortcuts);
    }

    #addResetRow(group, shortcuts) {
        const row = new Adw.ActionRow({ title: _('Reset shortcuts to defaults') });
        const button = new Gtk.Button({
            label: _('Reset'),
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        button.connect('clicked', () => {
            for (const pref of Object.keys(shortcuts))
                this.schema.reset(pref);
        });
        row.add_suffix(button);
        group.add(row);
    }
}
