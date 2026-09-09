/**
 * panelButton.js - WayToClip panel indicator (shell process).
 *
 * Owns the status-area button, its menu, clipboard monitoring and the
 * cursor popup. Kept out of extension.js so the entry point stays a
 * thin enable()/disable() pair that is easy to review for cleanup.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { gettext as nativeGettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { resetLanguageOverride, syncOverrideFromSettings, translate } from './src/i18n.js';
import { Registry } from './registry.js';
import { DialogManager } from './confirmDialog.js';
import { PopupPositionMode } from './constants.js';
import { Keyboard } from './keyboard.js';
import { CursorPopup } from './cursor-popup/cursorPopup.js';
import { SettingsManager } from './src/settingsManager.js';
import { HistoryStore } from './src/historyStore.js';
import { ClipboardMenuItem } from './src/clipboardMenuItem.js';
import { ClipboardManager } from './clipboardManager.js';
import { ShortcutManager } from './src/shortcutManager.js';
import { HistoryClearScheduler } from './src/historyClearScheduler.js';
import { AutoPaster } from './autoPaster.js';
import { isTerminalWindow, snapshotPasteTarget } from './src/pasteKeys.js';
import { error } from './src/logger.js';

const _ = msgid => translate(msgid, nativeGettext);

const INDICATOR_ICON = 'edit-paste-symbolic';

export const WayToClip = GObject.registerClass({
    GTypeName: 'WayToClip',
}, class WayToClip extends PanelMenu.Button {
    destroy() {
        this._clearPendingIdles();
        this._disconnectSettings();
        if (this._shortcutManager) {
            this._shortcutManager.destroy();
            this._shortcutManager = null;
        }
        if (this._clipboardManager) {
            this._clipboardManager.stop();
            this._clipboardManager = null;
        }
        if (this._scheduler) {
            this._scheduler.destroy();
            this._scheduler = null;
        }
        if (this._autoPaster) {
            this._autoPaster.destroy();
            this._autoPaster = null;
        }
        this._closeCursorPopup();
        this._cursorPopup = null;
        if (this._dialogManager) {
            this._dialogManager.destroy();
            this._dialogManager = null;
        }
        if (this._keyboard) {
            this._keyboard.destroy();
            this._keyboard = null;
        }
        if (this._settingsManager) {
            this._settingsManager.destroy();
            this._settingsManager = null;
        }
        resetLanguageOverride();

        super.destroy();
    }

    _init(deps) {
        super._init(0.0, 'WayToClip');
        // Null-initialized so destroy() stays safe if _init throws midway.
        this._settingsManager = null;
        this._shortcutManager = null;
        this._clipboardManager = null;
        this._scheduler = null;
        this._autoPaster = null;
        this._cursorPopup = null;
        this._dialogManager = null;
        this._keyboard = null;
        this._clipboard = deps.clipboard;
        this._openSettingsFunc = deps.openSettings;
        this._uuid = deps.uuid;

        syncOverrideFromSettings(deps.settings);
        this._settingsManager = new SettingsManager(deps.settings);
        this._snap = this._settingsManager.snapshot();
        // Private mode is UI-only state (was a module global).
        this._snap.privateMode = false;

        this._store = new HistoryStore();
        this._registry = new Registry({ settings: this._settingsManager.gio, uuid: this._uuid });
        this._keyboard = new Keyboard();
        this._cursorPopup = new CursorPopup(this);
        this._dialogManager = new DialogManager();

        this._settingsChangedId = 0;
        this._pendingIdles = [];
        this.clipItemsRadioGroup = [];
        this._pasteTarget = null;

        const hbox = new St.BoxLayout({
            style_class: 'panel-status-menu-box waytoclip-hbox',
        });
        this.hbox = hbox;
        this.icon = new St.Icon({
            icon_name: INDICATOR_ICON,
            style_class: 'system-status-icon waytoclip-icon',
        });
        hbox.add_child(this.icon);
        this.add_child(hbox);

        this._loadSettings();

        if (this._snap.clearOnBoot)
            this._registry.clearCacheFolder();

        this._clipboardManager = new ClipboardManager({
            clipboard: this._clipboard,
            registry: this._registry,
            isPrivateMode: () => this._snap.privateMode,
            isExcludedApp: wmClass => (this._snap.excludedApps ?? []).includes(wmClass),
            cacheImages: () => this._snap.cacheImages,
            onNewEntry: entry => this._onNewClipboardEntry(entry),
            onDuplicateEntry: entry => this._onDuplicateClipboardEntry(entry),
        });

        this._autoPaster = new AutoPaster({
            clipboardManager: this._clipboardManager,
            keyboard: this._keyboard,
        });

        this._shortcutManager = new ShortcutManager(this._settingsManager.gio, {
            handleClearHistory: () => this._removeAll(),
            handleTogglePopup: () => this._toggleCursorPopup(),
            handlePrivateMode: () => this.togglePrivateMode(),
        });

        this._scheduler = new HistoryClearScheduler({
            settings: this._settingsManager.gio,
            settingsManager: this._settingsManager,
            onClear: () => this._clearHistory(),
            onTick: secondsLeft => this._renderCountdown(secondsLeft),
        });

        // Private mode lives in the snapshot (was a module global).

        this._buildMenu().then(() => {
            // disable() may have run while the history read was in
            // flight (destroy nulls the managers); starting them now
            // would resurrect monitoring after teardown.
            if (!this._clipboardManager || !this._scheduler)
                return;
            this._clipboardManager.start();
            this._scheduler.start();
            this._applyKeybindingPref();
        }).catch(e => error('Failed to build menu', e));

        // Back-compat aliases: cursor-popup calls parent._removeEntry,
        // parent._selectMenuItem, parent._getAllIMenuItems, parent.moveItemFirst.
        this.cursorPopup = this._cursorPopup;
        this.keyboard = this._keyboard;
        this.dialogManager = this._dialogManager;
        this.extension = {
            clipboard: this._clipboard,
            settings: this._settingsManager.gio,
            openSettings: () => this._openSettings(),
        };
    }

    // --- menu construction ---

    async _buildMenu() {
        const clipHistory = await this._registry.read();

        this.favoritesSection = new PopupMenu.PopupMenuSection();
        this.historySection = new PopupMenu.PopupMenuSection();

        this.showPopupMenuItem = new PopupMenu.PopupMenuItem(_('Show clipboard popup'));
        this.showPopupMenuItem.insert_child_at_index(
            new St.Icon({
                icon_name: 'edit-paste-symbolic',
                style_class: 'waytoclip-menu-icon',
                y_align: Clutter.ActorAlign.CENTER,
            }),
            0,
        );
        this.menu.addMenuItem(this.showPopupMenuItem);
        this.showPopupMenuItem.connect('activate', () => {
            // Defer so the indicator menu can close before the
            // cursor popup takes its own modal grab.
            this._runIdle(() => this._openCursorPopup());
        });

        this.privateModeMenuItem = new PopupMenu.PopupSwitchMenuItem(
            _('Private mode'), false, { reactive: true });
        this.privateModeMenuItem.connect('toggled',
            this._onPrivateModeSwitch.bind(this));
        this.privateModeMenuItem.insert_child_at_index(
            new St.Icon({
                icon_name: 'security-medium-symbolic',
                style_class: 'waytoclip-menu-icon',
                y_align: Clutter.ActorAlign.CENTER,
            }),
            0,
        );
        this.menu.addMenuItem(this.privateModeMenuItem);

        this.clearMenuItem = new PopupMenu.PopupMenuItem(_('Clear history'));
        this.clearMenuItem.insert_child_at_index(
            new St.Icon({
                icon_name: 'user-trash-symbolic',
                style_class: 'waytoclip-menu-icon',
                y_align: Clutter.ActorAlign.CENTER,
            }),
            0,
        );

        const timerBox = new St.BoxLayout({
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        this.timerLabel = new St.Label({
            text: '',
            style: 'font-family: monospace;',
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        this.resetTimerButton = new St.Button({
            style_class: 'ci-action-btn',
            can_focus: true,
            child: new St.Icon({
                icon_name: 'view-refresh-symbolic',
                style_class: 'system-status-icon',
                icon_size: 14,
            }),
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.resetTimerButton.connect('clicked', () => {
            this._scheduler.schedule();
        });
        timerBox.add_child(this.timerLabel);
        timerBox.add_child(this.resetTimerButton);
        this.clearMenuItem.add_child(timerBox);

        this.clearMenuItem.connect('activate', this._removeAll.bind(this));
        this.menu.addMenuItem(this.clearMenuItem);

        this.settingsMenuItem = new PopupMenu.PopupMenuItem(_('Settings'));
        this.settingsMenuItem.insert_child_at_index(
            new St.Icon({
                icon_name: 'preferences-system-symbolic',
                style_class: 'waytoclip-menu-icon',
                y_align: Clutter.ActorAlign.CENTER,
            }),
            0,
        );
        this.menu.addMenuItem(this.settingsMenuItem);
        this.settingsMenuItem.connect('activate', this._openSettings.bind(this));

        // Populate data model (sections stay off the visible menu; the
        // cursor popup reads them via _getAllIMenuItems).
        this._store.load(clipHistory);
        for (const entry of this._store.entries)
            this._addEntry(entry);
        this._renderCountdown(this._scheduler.timeLeft());

        const selected = this._store.selected;
        if (selected) {
            const widget = this.clipItemsRadioGroup.find(m => m.entry === selected);
            if (widget)
                this._selectMenuItem(widget);
        }
    }

    _addEntry(entry, autoSelect, autoSetClip) {
        const menuItem = new ClipboardMenuItem(entry);
        menuItem.connect('activate', () => this._selectMenuItem(menuItem, true));
        this.clipItemsRadioGroup.push(menuItem);

        if (entry.isFavorite())
            this.favoritesSection.addMenuItem(menuItem, 0);
        else
            this.historySection.addMenuItem(menuItem, 0);

        if (autoSelect === true)
            this._selectMenuItem(menuItem, autoSetClip);
        else
            menuItem.setSelected(false);
        return menuItem;
    }

    // --- clipboard callbacks (single persistence write per event) ---

    _onNewClipboardEntry(entry) {
        this._store.add(entry);
        this._addEntry(entry, true, false);
        this._trimAndPersist();
        this._persist();
    }

    /**
     * Returns the matched widget (truthy) when the entry already exists
     * so ClipboardManager skips onNewEntry; null otherwise.
     */
    _onDuplicateClipboardEntry(entry) {
        const existing = this._store.findEqual(entry);
        if (!existing)
            return null;
        const widget = this.clipItemsRadioGroup.find(m => m.entry === existing);
        if (widget) {
            this._selectMenuItem(widget, false);
            // Re-copied duplicates always bubble to the top (favorites stay
            // pinned). Unlike selection, this is NOT gated on moveItemFirst.
            if (!existing.isFavorite())
                this._moveItemFirst(widget);
        }
        return widget ?? existing;
    }

    // --- history mutations (each persists exactly once) ---

    _favoriteToggle(menuItem) {
        this._store.toggleFavorite(menuItem.entry);
        this._moveItemFirst(menuItem);
    }

    _confirmRemoveAll() {
        // Defer so the indicator menu can close (releasing its grab)
        // before the confirm dialog takes its own modal grab. Opening
        // synchronously from the menu's 'activate' handler prevents the
        // dialog from appearing.
        this.menu.close();
        this._runIdle(() => {
            this._dialogManager.open({
                title: _('Clear all?'),
                message: _('Are you sure you want to delete all clipboard items?'),
                subMessage: _('This operation cannot be undone.'),
                okLabel: _('Clear'),
                cancelLabel: _('Cancel'),
                onConfirm: () => this._clearHistory(),
            });
        });
    }

    /**
     * Defer a callback to the next idle cycle. The source id is tracked
     * so destroy() can remove it if disable() happens before it fires
     * (review guidelines require removing all main loop sources).
     */
    _runIdle(callback) {
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._pendingIdles = this._pendingIdles.filter(x => x !== id);
            callback();
            return GLib.SOURCE_REMOVE;
        });
        this._pendingIdles.push(id);
    }

    _clearPendingIdles() {
        for (const id of this._pendingIdles)
            GLib.source_remove(id);
        this._pendingIdles = [];
    }

    _clearHistory() {
        const { removed, clearedClipboard } = this._store.clear({
            keepSelected: this._snap.keepSelectedOnClear,
        });
        for (const { entry } of removed)
            this._destroyWidgetForEntry(entry, { deleteImageFile: true });
        if (clearedClipboard)
            this._clipboardManager.clear();
        this._persist();
    }

    _removeAll() {
        if (this._snap.privateMode)
            return;
        if (this._snap.confirmOnClear)
            this._confirmRemoveAll();
        else
            this._clearHistory();
    }

    _removeEntry(menuItem, event) {
        const wasSelected = this._store.remove(menuItem.entry);
        if (event === 'delete' && wasSelected)
            this._clipboardManager.clear();

        menuItem.destroy();
        const idx = this.clipItemsRadioGroup.indexOf(menuItem);
        if (idx >= 0)
            this.clipItemsRadioGroup.splice(idx, 1);

        if (menuItem.entry.isImage()) {
            this._registry.deleteEntryFile(menuItem.entry).catch(e =>
                error('Failed to delete cached image', e));
        }
        this._persist();
    }

    _destroyWidgetForEntry(entry, { deleteImageFile = false } = {}) {
        const widget = this.clipItemsRadioGroup.find(m => m.entry === entry);
        if (!widget)
            return;
        widget.destroy();
        const idx = this.clipItemsRadioGroup.indexOf(widget);
        if (idx >= 0)
            this.clipItemsRadioGroup.splice(idx, 1);
        if (deleteImageFile && entry.isImage()) {
            this._registry.deleteEntryFile(entry).catch(e =>
                error('Failed to delete cached image', e));
        }
    }

    _trimAndPersist() {
        const removed = this._store.trim(this._snap.maxRegistryLength);
        for (const { entry } of removed)
            this._destroyWidgetForEntry(entry, { deleteImageFile: true });
    }

    _moveItemFirst(item) {
        const entry = item.entry;
        const wasSelected = item.currentlySelected;
        // Remove widget without deleting the image file (entry survives).
        item.destroy();
        const idx = this.clipItemsRadioGroup.indexOf(item);
        if (idx >= 0)
            this.clipItemsRadioGroup.splice(idx, 1);

        this._store.select(entry, { moveFirst: true });
        const replacement = this._addEntry(entry, wasSelected, false);
        void replacement;
        this._persist();
    }

    _onMenuItemSelected(menuItem, autoSet) {
        for (const other of this.clipItemsRadioGroup)
            other.setSelected(other === menuItem && !!menuItem.clipContents);
        this._store.select(menuItem.entry);
        if (autoSet !== false)
            this._clipboardManager.writeEntry(menuItem.entry);
    }

    _selectMenuItem(menuItem, autoSet) {
        this._onMenuItemSelected(menuItem, autoSet);
    }

    _getCurrentlySelectedItem() {
        return this.clipItemsRadioGroup.find(item => item.currentlySelected);
    }

    _getAllIMenuItems() {
        return this.historySection._getMenuItems()
            .concat(this.favoritesSection._getMenuItems());
    }

    _persist() {
        this._registry.write(this._store.toPersistable({
            cacheOnlyFavorite: this._snap.cacheOnlyFavorite,
        }));
    }

    // --- countdown label ---

    _renderCountdown(secondsLeft) {
        if (!this.timerLabel || !this.resetTimerButton)
            return;
        const enabled = this._snap.clearHistoryOnInterval;
        this.resetTimerButton.visible = enabled;
        this.timerLabel.visible = enabled;
        if (!enabled)
            return;
        if (secondsLeft == null || secondsLeft < 0) {
            this.timerLabel.set_text('');
            return;
        }
        if (secondsLeft <= 0) {
            this.timerLabel.set_text('');
            return;
        }
        const hours = Math.floor(secondsLeft / 3600);
        const minutes = Math.floor((secondsLeft % 3600) / 60);
        const seconds = Math.floor(secondsLeft % 60);
        let text = '';
        if (hours > 0)
            text += `${hours}h `;
        if (minutes > 0)
            text += `${minutes}m `;
        text += `${seconds}s`;
        this.timerLabel.set_text(text);
    }

    // --- popup wiring ---

    _toggleCursorPopup() {
        if (this._cursorPopup.isOpen())
            this._cursorPopup.close();
        else
            this._openCursorPopup();
    }

    _openCursorPopup() {
        // NOTE: no early return on empty history — the cursor popup stays
        // responsible for showing its "Clipboard history is empty" placeholder.

        // Snapshot the paste target while the target app still has
        // focus: opening the popup takes a modal grab and resets the
        // live content-purpose to NORMAL, which would make AutoPaster
        // misdetect terminals (plain Ctrl+V isn't bound to clipboard
        // paste there, so the chosen entry would not paste).
        const focusedWindow = global.display.get_focus_window();
        this._keyboard.savePurpose();
        this._pasteTarget = snapshotPasteTarget(
            this._keyboard.savedPurpose,
            this._isTerminalWindow(focusedWindow));

        let x, y;
        const monitor = global.display.get_current_monitor();
        const monitorGeometry = global.display.get_monitor_geometry(monitor);

        if (this._snap.popupPositionMode === PopupPositionMode.WINDOW_CENTER && focusedWindow) {
            const rect = focusedWindow.get_frame_rect();
            x = rect.x + rect.width / 2;
            y = rect.y + rect.height / 3;
        } else {
            [x, y] = global.get_pointer();
        }

        this._cursorPopup.open(x, y, this._getAllIMenuItems(), monitorGeometry);
    }

    _closeCursorPopup() {
        if (this._cursorPopup)
            this._cursorPopup.close();
    }

    /**
     * Snapshot whether the focused window is a terminal emulator.
     * Used as a fallback when the input method reports no
     * content-purpose (purpose stays undefined on some setups), in
     * which case purpose-based detection can never fire.
     */
    _isTerminalWindow(focusedWindow) {
        if (!focusedWindow)
            return false;
        const wmClass = focusedWindow.get_wm_class() ?? null;
        // App lookup is best-effort: windows without an app yield null.
        const app = Shell.WindowTracker.get_default().get_window_app(focusedWindow);
        const appId = app ? app.get_id() : null;
        return isTerminalWindow(wmClass, appId,
            this._snap.terminalApps ?? []);
    }

    autoPasteAndClose(menuItem) {
        // cursorPopup may pass a widget that _moveItemFirst just destroyed
        // (entry object survives); resolve to the live widget first.
        const entry = menuItem.entry;
        const live = this.clipItemsRadioGroup.find(m => m.entry === entry) ?? menuItem;
        this.menu.close();
        this._closeCursorPopup();
        const currentlySelected = this._getCurrentlySelectedItem();
        const previouslySelected = currentlySelected && currentlySelected !== live
            ? currentlySelected.entry
            : null;
        // Selecting also sets the clipboard; AutoPaster restores afterwards.
        this._selectMenuItem(live, true);
        if (this._snap.autoPaste) {
            this._autoPaster.paste(entry, previouslySelected, null,
                this._pasteTarget);
        }
    }

    // --- private mode ---

    togglePrivateMode() {
        this.privateModeMenuItem.toggle();
    }

    get isPrivateMode() {
        return this._snap.privateMode;
    }

    get moveItemFirst() {
        return this._snap.moveItemFirst;
    }

    _onPrivateModeSwitch() {
        this._snap.privateMode = this.privateModeMenuItem.state;
        if (!this._snap.privateMode) {
            const selected = this._getCurrentlySelectedItem();
            if (selected)
                this._selectMenuItem(selected);
            else
                this._clipboardManager.clear();
            this.hbox.remove_style_class_name('private-mode');
        } else {
            this.hbox.add_style_class_name('private-mode');
        }
    }

    // --- settings ---

    _loadSettings() {
        this._settingsChangedId = this._settingsManager.onAnyChange(
            () => this._onSettingsChange());
        this._refreshSnapshot();
        this._cursorPopup.updateSettings(this._settingsManager.gio);
    }

    _refreshSnapshot() {
        syncOverrideFromSettings(this._settingsManager.gio);
        const privateMode = this._snap.privateMode ?? false;
        this._snap = this._settingsManager.snapshot();
        this._snap.privateMode = privateMode;
        this._cursorPopup.updateSettings(this._settingsManager.gio);
    }

    async _onSettingsChange() {
        try {
            this._refreshSnapshot();
            this._trimAndPersist();
            this._persist();
            this._applyKeybindingPref();
            this._renderCountdown(this._scheduler.timeLeft());
        } catch (e) {
            error('Failed to update registry', e);
        }
    }

    _applyKeybindingPref() {
        if (!this._shortcutManager)
            return;
        if (this._snap.enableKeybinding)
            this._shortcutManager.bindAll();
        else
            this._shortcutManager.unbindAll();
    }

    _disconnectSettings() {
        // onAnyChange() always returns a disconnect closure (see SettingsManager).
        if (this._settingsChangedId) {
            this._settingsChangedId();
            this._settingsChangedId = 0;
        }
    }

    _openSettings() {
        this._openSettingsFunc();
    }
});
