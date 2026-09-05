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
     * @param {number} maxLines - max text lines for this row (3, 2 or 1).
     *   Used to shrink rows so the locked popup box keeps fitting without moving.
     */
    createItemWidget(mItem, index, onSelect, maxLines = 3) {
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
        // Truncate long rows to fit the locked popup height: 3 lines is the
        // stylesheet default (4.8em), 2 lines ~3.2em, 1 line ~1.6em.
        // Inline style wins over the stylesheet so pages can shrink rows
        // instead of moving/resizing the popup box away from the cursor.
        if (maxLines === 2) {
            textLabel.set_style('max-height: 3.2em;');
        } else if (maxLines <= 1) {
            textLabel.set_style('max-height: 1.6em;');
        }

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
     * Initial placement near the cursor. Always prioritizes BELOW the cursor
     * when the popup fits there; only pops upwards when there is not enough
     * space below but there is enough above. Left edge starts at the cursor
     * and is clamped once — callers lock the returned X and cursor-anchored
     * edge and must never recompute placement on page changes.
     *
     * @param {St.Widget} modalContainer
     * @param {St.BoxLayout} popup
     * @param {number} x - cursor X in global coordinates
     * @param {number} y - cursor Y in global coordinates
     * @param {Object} monitor - { x, y, width, height }
     * @returns {{ x: number, y: number, mode: string, belowTopY: number, aboveBottomY: number }}
     */
    positionPopup(modalContainer, popup, x, y, monitor) {
        const MARGIN = 10;
        const GAP_BELOW = 20;
        const GAP_ABOVE = 10;

        const [, natW] = popup.get_preferred_width(-1);
        const [, natH] = popup.get_preferred_height(natW);

        // Position the modal container to cover the monitor
        modalContainer.set_position(monitor.x, monitor.y);
        modalContainer.set_size(monitor.width, monitor.height);

        const relX = x - monitor.x;
        const relY = y - monitor.y;

        // Lock left edge at cursor, clamped once to stay on-screen.
        const popupX = Math.max(MARGIN, Math.min(relX, monitor.width - natW - MARGIN));

        const spaceBelow = monitor.height - relY - GAP_BELOW - MARGIN;
        const spaceAbove = relY - GAP_ABOVE - MARGIN;

        const belowTopY = relY + GAP_BELOW;
        const aboveBottomY = relY - GAP_ABOVE;

        let mode;
        let popupY;
        if (natH <= spaceBelow) {
            // Prefer below whenever it fits.
            mode = 'below';
            popupY = belowTopY;
        } else if (natH <= spaceAbove) {
            mode = 'above';
            popupY = aboveBottomY - natH;
        } else {
            // Neither side fits: prefer below, truncated to available space.
            mode = 'below';
            popupY = belowTopY;
        }

        popup.set_position(popupX, popupY);

        return { x: popupX, y: popupY, mode, belowTopY, aboveBottomY };
    }

    /**
     * Keep the popup glued to the cursor after content changes.
     * Left edge is always locked; the cursor-anchored edge is locked too:
     * below-mode keeps top at belowTopY (bottom grows/shrinks),
     * above-mode keeps bottom at aboveBottomY (top grows/shrinks).
     * Width may only grow rightwards and is capped to the monitor instead
     * of moving X. Height is left natural; callers truncate rows or hard-cap
     * when natural height exceeds available space.
     */
    anchorPopup(modalContainer, popup, lock, monitor, natH = null) {
        const MARGIN = 10;

        modalContainer.set_position(monitor.x, monitor.y);
        modalContainer.set_size(monitor.width, monitor.height);

        // Right side may grow, but never push X: cap width to monitor.
        const [, natW] = popup.get_preferred_width(-1);
        const availableW = Math.max(0, monitor.width - lock.x - MARGIN);
        if (natW > availableW) {
            popup.set_width(availableW);
        } else {
            popup.set_width(-1);
        }

        if (natH === null) {
            const [, h] = popup.get_preferred_height(
                Math.min(natW, availableW));
            natH = h;
        }

        if (lock.mode === 'above') {
            popup.set_position(lock.x, lock.aboveBottomY - natH);
        } else {
            popup.set_position(lock.x, lock.belowTopY);
        }

        return natH;
    }

    /**
     * Natural popup size for the current children, honoring any width cap.
     */
    measurePopup(popup, monitor, lockedX) {
        const MARGIN = 10;
        const [, natW] = popup.get_preferred_width(-1);
        const availableW = Math.max(0, monitor.width - lockedX - MARGIN);
        const effW = Math.min(natW, availableW);
        const [, natH] = popup.get_preferred_height(effW);
        return { natW, natH, availableW };
    }
}
