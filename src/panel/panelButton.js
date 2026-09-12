import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { gettext as nativeGettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { makeTranslator } from '../common/i18n.js';

const _ = makeTranslator(nativeGettext);

const INDICATOR_ICON = 'edit-paste-symbolic';

export const WayToClip = GObject.registerClass({
    GTypeName: 'WayToClip',
}, class WayToClip extends PanelMenu.Button {
    _init({ onShowPopup, onTogglePrivateMode, onRequestClearHistory,
        onResetClearTimer, onOpenSettings }) {
        super._init(0.0, 'WayToClip');
        this._handlers = { onShowPopup, onTogglePrivateMode, onRequestClearHistory,
            onResetClearTimer, onOpenSettings };
        // guards setPrivateMode(): setToggleState() emits toggled too
        this._settingPrivateMode = false;

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

        this._buildMenu();
    }

    // --- view API ---

    setPrivateMode(on) {
        this._settingPrivateMode = true;
        try {
            this.privateModeMenuItem.setToggleState(!!on);
        } finally {
            this._settingPrivateMode = false;
        }
        if (on)
            this.hbox.add_style_class_name('private-mode');
        else
            this.hbox.remove_style_class_name('private-mode');
    }

    setCountdown(secondsLeft, enabled) {
        if (!this.timerLabel || !this.resetTimerButton)
            return;
        this.resetTimerButton.visible = enabled;
        this.timerLabel.visible = enabled;
        if (!enabled)
            return;
        if (secondsLeft == null || secondsLeft <= 0) {
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

    closeMenu() {
        this.menu.close();
    }

    // --- menu construction ---

    _buildMenu() {
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
            this._handlers.onShowPopup();
        });

        this.privateModeMenuItem = new PopupMenu.PopupSwitchMenuItem(
            _('Private mode'), false, { reactive: true });
        this.privateModeMenuItem.connect('toggled', () => {
            if (this._settingPrivateMode)
                return;
            this._handlers.onTogglePrivateMode();
        });
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
            this._handlers.onResetClearTimer();
        });
        this.resetTimerButton.visible = false;
        this.timerLabel.visible = false;
        timerBox.add_child(this.timerLabel);
        timerBox.add_child(this.resetTimerButton);
        this.clearMenuItem.add_child(timerBox);

        this.clearMenuItem.connect('activate', () => this._handlers.onRequestClearHistory());
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
        this.settingsMenuItem.connect('activate', () => this._handlers.onOpenSettings());
    }
});
