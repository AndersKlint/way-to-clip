import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { WayToClip } from './src/panel/panelButton.js';

export default class WayToClipExtension extends Extension {
    enable() {
        this.waytoclip = new WayToClip({
            clipboard: St.Clipboard.get_default(),
            settings: this.getSettings(),
            openSettings: () => this.openPreferences(),
            uuid: this.uuid,
        });

        Main.panel.addToStatusArea('waytoclip', this.waytoclip, 1);
    }

    disable() {
        if (this.waytoclip) {
            this.waytoclip.destroy();
            this.waytoclip = null;
        }
    }
}
