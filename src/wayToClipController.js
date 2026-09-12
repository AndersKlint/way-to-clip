import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import { gettext as nativeGettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { resetLanguageOverride, syncOverrideFromSettings, makeTranslator } from './common/i18n.js';
import { PrefsFields, PopupPositionMode } from './common/constants.js';
import { error } from './common/logger.js';
import { Registry } from './history/registry.js';
import { HistoryStore } from './history/historyStore.js';
import { HistoryClearScheduler } from './history/historyClearScheduler.js';
import { ClipboardManager } from './clipboard/clipboardManager.js';
import { Keyboard } from './paste/keyboard.js';
import { AutoPaster } from './paste/autoPaster.js';
import { isTerminalWindow, snapshotPasteTarget } from './paste/pasteKeys.js';
import { SettingsManager } from './settings/settingsManager.js';
import { ShortcutManager } from './settings/shortcutManager.js';
import { CursorPopup } from './cursorPopup/cursorPopup.js';
import { DialogManager } from './panel/confirmDialog.js';
import { WayToClip } from './panel/panelButton.js';

const _ = makeTranslator(nativeGettext);

// Main orchestration class for the extension. Handles callbacks, state and overall component orchestration.
export class WayToClipController {
    constructor({ clipboard, settings, openSettings, uuid }) {
        this._settingsManager = null;
        this._registry = null;
        this._shortcutManager = null;
        this._clipboardManager = null;
        this._scheduler = null;
        this._autoPaster = null;
        this._cursorPopup = null;
        this._dialogManager = null;
        this._keyboard = null;
        this._panel = null;
        this._clipboard = clipboard;
        this._openSettingsFunc = openSettings;
        this._uuid = uuid;

        syncOverrideFromSettings(settings);
        this._settingsManager = new SettingsManager(settings);
        this._settingsSnapshot = this._settingsManager.snapshot();
        this._privateMode = false;

        this._store = new HistoryStore();
        this._registry = new Registry({ settings: this._settingsManager.gio, uuid: this._uuid });
        this._keyboard = new Keyboard();
        this._cursorPopup = new CursorPopup({
            onGetEntries: () => this.entries,
            onSelectEntryFromPopup: entry => this.selectClipboardEntryFromPopup(entry),
            onRemoveEntry: (entry, event) => this.removeClipboardEntry(entry, event),
            onTogglePrivateMode: () => this.togglePrivateMode(),
            onIsPrivateMode: () => this.isPrivateMode(),
            onSetSearchOption: (name, value) => this.setSearchOption(name, value),
        });
        this._dialogManager = new DialogManager();

        this._settingsChangedId = 0;
        this._pendingIdles = [];
        this._pasteTarget = null;

        this._panel = new WayToClip({
            onShowPopup: () => this.showPopupFromIndicatorMenu(),
            onTogglePrivateMode: () => this.togglePrivateMode(),
            onRequestClearHistory: () => this.requestClearHistory(),
            onResetClearTimer: () => this.resetClearTimer(),
            onOpenSettings: () => this.openSettings(),
        });

        this._loadSettings();

        if (this._settingsSnapshot.clearOnBoot)
            this._registry.clearCacheFolder();

        this._clipboardManager = new ClipboardManager({
            clipboard: this._clipboard,
            registry: this._registry,
            isPrivateMode: () => this._privateMode,
            isExcludedApp: wmClass => (this._settingsSnapshot.excludedApps ?? []).includes(wmClass),
            shouldCacheImages: () => this._settingsSnapshot.shouldCacheImages,
            onNewEntry: entry => this._onNewClipboardEntry(entry),
            onDuplicateEntry: entry => this._onDuplicateClipboardEntry(entry),
        });

        this._autoPaster = new AutoPaster({
            clipboardManager: this._clipboardManager,
            keyboard: this._keyboard,
        });

        this._shortcutManager = new ShortcutManager(this._settingsManager.gio, {
            onRequestClearHistory: () => this.requestClearHistory(),
            onToggleCursorPopup: () => this.toggleCursorPopup(),
            onTogglePrivateMode: () => this.togglePrivateMode(),
        });

        this._scheduler = new HistoryClearScheduler({
            settings: this._settingsManager.gio,
            settingsManager: this._settingsManager,
            onClear: () => this._clearHistory(),
            onTick: secondsLeft => this._panel.setCountdown(
                secondsLeft, this._settingsSnapshot.clearHistoryOnInterval),
        });

        this._boot();
    }

    get panelButton() {
        return this._panel;
    }

    destroy() {
        this._clearPendingIdles();
        this._disconnectSettings();
        if (this._registry) {
            this._registry.destroy();
            this._registry = null;
        }
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
        if (this._cursorPopup) {
            this._cursorPopup.destroy();
            this._cursorPopup = null;
        }
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
        if (this._panel) {
            this._panel.destroy();
            this._panel = null;
        }
        resetLanguageOverride();
    }

    // --- state ---

    get entries() {
        return this._store.entries;
    }

    get selectedEntry() {
        return this._store.selected;
    }

    isPrivateMode() {
        return this._privateMode;
    }

    // --- boot ---

    async _boot() {
        try {
            const clipHistory = await this._registry.read();
            // bail if disable() ran while history was still loading
            if (!this._clipboardManager || !this._scheduler || !this._panel)
                return;
            this._store.load(clipHistory);
            this._panel.setPrivateMode(this._privateMode);
            this._panel.setCountdown(this._scheduler.timeLeft(),
                this._settingsSnapshot.clearHistoryOnInterval);
            this._clipboardManager.start();
            this._scheduler.start();
            this._applyKeybindingPref();
        } catch (e) {
            error('Failed to build menu', e);
        }
    }

    // --- clipboard manipulation ---

    _onNewClipboardEntry(entry) {
        this._store.add(entry);
        this._store.select(entry);
        this._trimHistory();
        this._persist();
    }

    _onDuplicateClipboardEntry(entry) {
        const existing = this._store.findEqual(entry);
        if (!existing)
            return null;
        // re-copies always bubble up (favorites stay pinned), not gated on the pref
        this._store.select(existing, { moveFirst: true });
        this._persist();
        // truthy tells the clipboard watcher this was a duplicate, not a new entry
        return existing;
    }

    selectEntry(entry, { setClipboard = true } = {}) {
        const existing = this._store.select(entry);
        if (!existing)
            return;
        if (setClipboard !== false)
            this._clipboardManager.writeEntry(existing);
    }

    removeClipboardEntry(entry, event) {
        const wasSelected = this._store.remove(entry);
        if (event === 'delete' && wasSelected)
            this._clipboardManager.clear();

        if (entry.isImage()) {
            this._registry.deleteEntryFile(entry).catch(e =>
                error('Failed to delete cached image', e));
        }
        this._persist();
    }

    // no favorites UI yet, backend only, persisted from the original fork from clipboard-indicator.
    // I need to figure out a decent ux design before implementing it
    toggleFavorite(entry) {
        if (!this._store.has(entry))
            return;
        this._store.toggleFavorite(entry);
        this._store.select(entry, { moveFirst: true });
        this._persist();
    }

    // --- history ---

    requestClearHistory() {
        if (this._privateMode)
            return;
        if (this._settingsSnapshot.confirmOnClear)
            this._confirmRemoveAll();
        else
            this._clearHistory();
    }

    _confirmRemoveAll() {
        // menu has to close first or the dialog never shows
        this._panel.closeMenu();
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


    _clearHistory() {
        const { removed, clearedClipboard } = this._store.clear({
            keepSelected: this._settingsSnapshot.keepSelectedOnClear,
        });
        for (const { entry } of removed) {
            if (entry.isImage()) {
                this._registry.deleteEntryFile(entry).catch(e =>
                    error('Failed to delete cached image', e));
            }
        }
        if (clearedClipboard)
            this._clipboardManager.clear();
        this._persist();
    }

    _trimHistory() {
        const removed = this._store.trim(this._settingsSnapshot.maxRegistryLength);
        for (const { entry } of removed) {
            if (entry.isImage()) {
                this._registry.deleteEntryFile(entry).catch(e =>
                    error('Failed to delete cached image', e));
            }
        }
    }

    _persist() {
        this._registry.write(this._store.toPersistable({
            cacheOnlyFavorite: this._settingsSnapshot.cacheOnlyFavorite,
        }));
    }

    // --- popup wiring ---

    // run next idle, tracked so destroy() can cancel it
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

    // Needs to run in an idle so the indicator menu has time to close
    showPopupFromIndicatorMenu() {
        this._runIdle(() => this.openCursorPopup());
    }

    toggleCursorPopup() {
        if (this._cursorPopup.isOpen())
            this._cursorPopup.close();
        else
            this.openCursorPopup();
    }

    openCursorPopup() {
        // grab the target first. Opening the popup steals focus and messes up terminal detection.
        const focusedWindow = global.display.get_focus_window();
        this._keyboard.savePurpose();
        this._pasteTarget = snapshotPasteTarget(
            this._keyboard.savedPurpose,
            this._isTerminalWindow(focusedWindow));

        let x, y;
        const monitor = global.display.get_current_monitor();
        const monitorGeometry = global.display.get_monitor_geometry(monitor);

        if (this._settingsSnapshot.popupPositionMode === PopupPositionMode.WINDOW_CENTER && focusedWindow) {
            const rect = focusedWindow.get_frame_rect();
            x = rect.x + rect.width / 2;
            y = rect.y + rect.height / 3;
        } else {
            [x, y] = global.get_pointer();
        }

        this._cursorPopup.open(x, y, this._store.entries, monitorGeometry);
    }

    closeCursorPopup() {
        if (this._cursorPopup)
            this._cursorPopup.close();
    }

    // terminals need special paste handling (ctrl+shift+v)
    _isTerminalWindow(focusedWindow) {
        if (!focusedWindow)
            return false;
        const wmClass = focusedWindow.get_wm_class() ?? null;
        const app = Shell.WindowTracker.get_default().get_window_app(focusedWindow);
        const appId = app ? app.get_id() : null;
        return isTerminalWindow(wmClass, appId,
            this._settingsSnapshot.terminalApps ?? []);
    }

    selectClipboardEntryFromPopup(entry) {
        const live = this._store.findEqual(entry) ?? entry;
        if (!this._store.has(live)) {
            this._cursorPopup.close();
            return;
        }
        this.selectEntry(live, { setClipboard: true });
        if (this._settingsSnapshot.moveItemFirst) {
            this._store.select(live, { moveFirst: true });
            this._persist();
        }
        if (this._settingsSnapshot.autoPaste)
            this._pasteAndClose(live);
        else
            this._cursorPopup.close();
    }

    _pasteAndClose(entry) {
        this._panel.closeMenu();
        this.closeCursorPopup();
        const currentlySelected = this._store.selected;
        const previouslySelected = currentlySelected && currentlySelected !== entry
            ? currentlySelected
            : null;
        this.selectEntry(entry, { setClipboard: true });
        if (this._settingsSnapshot.autoPaste) {
            this._autoPaster.paste(entry, previouslySelected, null,
                this._pasteTarget);
        }
    }

    // --- private mode ---

    togglePrivateMode() {
        this._privateMode = !this._privateMode;
        if (!this._privateMode) {
            const selected = this._store.selected;
            if (selected)
                this.selectEntry(selected, { setClipboard: true });
            else
                this._clipboardManager.clear();
        }
        this._panel.setPrivateMode(this._privateMode);
        if (this._cursorPopup.isOpen())
            this._cursorPopup.updatePrivateModeState();
    }

    // --- settings ---

    _loadSettings() {
        this._settingsChangedId = this._settingsManager.onAnyChange(
            () => this._onSettingsChange());
        this._refreshSnapshot();
    }

    _refreshSnapshot() {
        syncOverrideFromSettings(this._settingsManager.gio);
        this._settingsSnapshot = this._settingsManager.snapshot();
        this._cursorPopup.applySettings(this._settingsSnapshot);
    }

    // popup search toggles write back here. Gio write fires changed, which round-trips through _refreshSnapshot.
    setSearchOption(name, value) {
        const key = name === 'regex'
            ? PrefsFields.REGEX_SEARCH
            : PrefsFields.CASE_SENSITIVE_SEARCH;
        this._settingsManager.gio.set_boolean(key, !!value);
    }

    async _onSettingsChange() {
        try {
            this._refreshSnapshot();
            this._trimHistory();
            this._persist();
            this._applyKeybindingPref();
            this._panel.setCountdown(this._scheduler.timeLeft(),
                this._settingsSnapshot.clearHistoryOnInterval);
        } catch (e) {
            error('Failed to update registry', e);
        }
    }

    resetClearTimer() {
        this._scheduler.schedule();
    }

    openSettings() {
        this._openSettingsFunc();
    }

    _applyKeybindingPref() {
        if (!this._shortcutManager)
            return;
        if (this._settingsSnapshot.enableKeybinding)
            this._shortcutManager.bindAll();
        else
            this._shortcutManager.unbindAll();
    }

    _disconnectSettings() {
        // onAnyChange gives us a disconnect func directly
        if (this._settingsChangedId) {
            this._settingsChangedId();
            this._settingsChangedId = 0;
        }
    }
}
