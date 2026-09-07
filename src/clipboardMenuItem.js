/**
 * ClipboardMenuItem - PopupMenuItem subclass carrying a ClipboardEntry.
 *
 * Replaces the monkey-patching in extension.js (_addEntry attached
 * .entry/.clipContents/.radioGroup/.currentlySelected onto a plain
 * PopupMenuItem). Selection ornament is managed explicitly so the
 * O(n) ornament loop in _onMenuItemSelected can go through one method.
 */

import GObject from 'gi://GObject';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const ClipboardMenuItem = GObject.registerClass(
class ClipboardMenuItem extends PopupMenu.PopupMenuItem {
    _init(entry) {
        super._init('');
        this.entry = entry;
        this.clipContents = entry.getStringValue();
        this.currentlySelected = false;
    }

    refreshLabel() {
        this.clipContents = this.entry.getStringValue();
        this.label.set_text(this.clipContents);
    }

    setSelected(selected) {
        this.currentlySelected = selected;
        this.setOrnament(selected
            ? PopupMenu.Ornament.DOT
            : PopupMenu.Ornament.NONE);
    }
});
