import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { WayToClipController } from './src/wayToClipController.js';

export default class WayToClipExtension extends Extension {
    enable() {
        this.controller = new WayToClipController({
            clipboard: St.Clipboard.get_default(),
            settings: this.getSettings(),
            openSettings: () => this.openPreferences(),
            uuid: this.uuid,
        });

        Main.panel.addToStatusArea('waytoclip', this.controller.panelButton, 1);
    }

    disable() {
        if (this.controller) {
            this.controller.destroy();
            this.controller = null;
        }
    }
}
