/**
 * PopupUIBuilder - Constructs and positions all UI widgets for the cursor popup.
 */

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

export class PopupUIBuilder {
    /**
     * Create the full-screen modal overlay widget.
     */
    createModalContainer() {
        return new St.Widget({
            reactive: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
        });
    }

    /**
     * Create the main popup box layout.
     */
    createPopupLayout() {
        return new St.BoxLayout({
            style_class: 'waytoclip-cursor-popup',
            vertical: true,
            reactive: true,
        });
    }

    /**
     * Create the scrollable list container for clipboard items.
     */
    createListContainer() {
        return new St.BoxLayout({
            style_class: 'waytoclip-popup-list',
            vertical: true,
        });
    }

    /**
     * Create the search entry widget with event bindings.
     * @param {Function} onTextChanged - callback(queryText)
     * @param {Function} onKeyPress - callback(event) => Clutter.EVENT_*
     */
    createSearchEntry(onTextChanged, onKeyPress) {
        const entry = new St.Entry({
            style_class: 'waytoclip-search-entry',
            hint_text: _('Search...'),
            visible: false,
            x_expand: true,
        });

        entry.get_clutter_text().connect('text-changed', (actor) => {
            onTextChanged(actor.get_text());
        });

        entry.get_clutter_text().connect('key-press-event', (_actor, event) => {
            return onKeyPress(event);
        });

        return entry;
    }

    /**
     * Create the page indicator label.
     */
    createPageIndicator() {
        return new St.Label({
            style_class: 'waytoclip-page-indicator',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
    }

    /**
     * Build the footer bar with hints and the page indicator.
     * @returns {{ footerBox: St.BoxLayout, privateModeHint: St.BoxLayout, pageIndicator: St.Label }}
     */
    createFooter() {
        const searchHint = new St.Label({
            text: '🔍 = s',
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.START,
        });

        const privateModeHint = new St.BoxLayout({
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.START,
        });
        const privateIcon = new St.Icon({
            icon_name: 'security-medium-symbolic',
        });
        privateModeHint.add_child(privateIcon);
        privateModeHint.add_child(new St.Label({ text: ' = p' }));

        const deleteHint = new St.Label({
            text: '🗑 = d',
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.END,
        });

        const pageIndicator = this.createPageIndicator();

        const footerBox = new St.BoxLayout({ x_expand: true });
        footerBox.add_child(searchHint);
        footerBox.add_child(privateModeHint);
        footerBox.add_child(pageIndicator);
        footerBox.add_child(deleteHint);

        return { footerBox, privateModeHint, pageIndicator };
    }

    /**
     * Create a single clipboard item widget.
     * @param {Object} mItem - the menu item data
     * @param {number} index - 0-based index within the current page
     * @param {Function} onSelect - callback(mItem) when clicked
     */
    createItemWidget(mItem, index, onSelect) {
        const itemBox = new St.BoxLayout({
            style_class: 'waytoclip-popup-item',
            reactive: true,
            x_expand: true,
            track_hover: true,
            vertical: true,
        });

        const topRow = new St.BoxLayout({
            x_expand: true,
            vertical: false,
        });

        const numberLabel = new St.Label({
            text: `${(index + 1) % 10}. `,
            style_class: 'waytoclip-item-number',
            y_align: Clutter.ActorAlign.START,
        });

        const textContainer = new St.BoxLayout({
            style_class: 'waytoclip-item-text-container',
            vertical: true,
            x_expand: true,
        });

        const textLabel = new St.Label({
            text: mItem.entry.getStringValue(),
            style_class: 'waytoclip-item-text',
            y_align: Clutter.ActorAlign.START,
            x_expand: true,
        });
        textLabel.get_clutter_text().set_line_wrap(true);
        textLabel.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        textLabel.get_clutter_text().set_ellipsize(Pango.EllipsizeMode.END);

        textContainer.add_child(textLabel);
        topRow.add_child(numberLabel);
        topRow.add_child(textContainer);
        itemBox.add_child(topRow);

        itemBox.connect('button-press-event', () => {
            onSelect(mItem);
            return Clutter.EVENT_STOP;
        });

        return itemBox;
    }

    /**
     * Position the popup near the cursor, clamped within the monitor bounds.
     * @param {St.Widget} modalContainer
     * @param {St.BoxLayout} popup
     * @param {number} x - cursor X in global coordinates
     * @param {number} y - cursor Y in global coordinates
     * @param {Object} monitor - { x, y, width, height }
     */
    positionPopup(modalContainer, popup, x, y, monitor) {
        const [, natW] = popup.get_preferred_width(-1);
        const [, natH] = popup.get_preferred_height(natW);

        // Position the modal container to cover the monitor
        modalContainer.set_position(monitor.x, monitor.y);
        modalContainer.set_size(monitor.width, monitor.height);

        // Compute popup position relative to monitor
        let popupX = x - monitor.x;
        let popupY = y - monitor.y - natH - 10;

        // Clamp horizontally
        popupX = Math.max(10, Math.min(popupX, monitor.width - natW - 10));

        // Flip below cursor if no room above
        if (popupY < 10) {
            popupY = y - monitor.y + 20;
        }

        // Clamp vertically
        if (popupY + natH > monitor.height - 10) {
            popupY = Math.max(10, monitor.height - natH - 10);
        }

        popup.set_position(popupX, popupY);
    }
}
