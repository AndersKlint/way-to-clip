import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { WayToClip } from './panelButton.js';

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
        // enable() may have thrown before assigning (or never run),
        // in which case there is nothing to tear down.
        if (this.waytoclip) {
            this.waytoclip.destroy();
            this.waytoclip = null;
        }
    }
}
