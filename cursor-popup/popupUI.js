/**
 * PopupUIBuilder - Constructs and positions all UI widgets for the cursor popup.
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as nativeGettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { translate } from '../src/i18n.js';

/** Default thumbnail size for image entries in the cursor popup. */
const _ = msgid => translate(msgid, nativeGettext);
export const IMAGE_PREVIEW_SIZE = 96;

/** Hover delay (ms) before a search-toggle tooltip appears. */
const SEARCH_TOOLTIP_DELAY_MS = 500;

export class PopupUIBuilder {
    constructor() {
        this._imagePreviewSize = IMAGE_PREVIEW_SIZE;
        this._pendingSearchTooltips = new Set();
    }

    /**
     * Update the thumbnail size for image previews.
     * Clamped to the same 32-512 range as the GSettings schema so
     * out-of-range values (or stale prefs) can't collapse the layout.
     */
    setImagePreviewSize(size) {
        if (!Number.isFinite(size))
            return;
        this._imagePreviewSize = Math.min(512, Math.max(32, Math.round(size)));
    }
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
     * This is the inner box holding the rows; it must be placed inside
     * the St.ScrollView returned by createListScrollView() so the list
     * can scroll when the popup doesn't fit on screen.
     */
    createListContainer() {
        return new St.BoxLayout({
            style_class: 'waytoclip-popup-list',
            vertical: true,
        });
    }

    /**
     * Create the scroll wrapper for the item list.
     * Scrolling stays disabled (policy NEVER) until CursorPopup caps the
     * list height on overflow; that keeps the popup naturally sized when
     * everything fits and only scrolls when it doesn't.
     * @param {St.BoxLayout} listBox - inner container from createListContainer()
     */
    createListScrollView(listBox) {
        const scrollView = new St.ScrollView({
            style_class: 'waytoclip-popup-list-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
            overlay_scrollbars: true,
            x_expand: true,
        });
        scrollView.set_child(listBox);
        return scrollView;
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
     * Create a small toggle button for the search bar ("Aa" / ".*").
     * @param {string} label - button text
     * @param {string} tooltip - tooltip text
     * @returns {St.Button}
     */
    createSearchToggleButton(label) {
        const button = new St.Button({
            style_class: 'waytoclip-search-toggle',
            toggle_mode: true,
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: new St.Label({ text: label }),
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: false,
            y_expand: false,
        });
        return button;
    }

    /**
     * Create the shared floating hover tooltip (search toggles, footer
     * hints). It is hidden by default; callers add it to the fullscreen
     * modal container (so it floats above the popup without disturbing
     * the layout) and wire actors via attachSearchTooltip().
     * @returns {St.Label}
     */
    createSearchTooltip() {
        return new St.Label({
            style_class: 'waytoclip-search-tooltip',
            visible: false,
        });
    }

    /**
     * Cancel all pending (delayed) search-toggle tooltip timeouts.
     */
    cancelPendingSearchTooltips() {
        // Fired timeouts remove themselves from the set, so every id
        // here is still pending and safe to remove.
        for (const id of this._pendingSearchTooltips)
            GLib.source_remove(id);
        this._pendingSearchTooltips = new Set();
    }

    /**
     * Show `tooltip` with `text` anchored above `button` (below it when
     * there is no room above), clamped inside `container`. Restacks the
     * tooltip above its siblings first so it always paints on top of
     * the popup.
     */
    _positionSearchTooltip(tooltip, button, container, text) {
        tooltip.set_text(text);
        container.set_child_above_sibling(tooltip, null);
        // Show first so preferred-size reflects the new text, then
        // position synchronously — no painted frame in between.
        tooltip.visible = true;

        const [conX, conY] = container.get_transformed_position();
        const [conW] = container.get_size();
        const [btnX, btnY] = button.get_transformed_position();
        const btnW = button.get_width();
        const btnH = button.get_height();

        const [, natW] = tooltip.get_preferred_width(-1);
        const [, natH] = tooltip.get_preferred_height(natW);

        const relX = btnX - conX;
        const relY = btnY - conY;

        let x = relX + btnW / 2 - natW / 2;
        x = Math.max(4, Math.min(x, Math.max(4, conW - natW - 4)));

        let y = relY - natH - 8;
        if (y < 4)
            y = relY + btnH + 8;

        tooltip.set_position(x, y);
    }

    /**
     * Wire a custom hover tooltip on any reactive actor (search
     * toggles, footer hints): native St tooltips do not render here,
     * so the shared floating label is shown after a short hover delay
     * and hidden on leave.
     */
    attachSearchTooltip(button, text, tooltip, container) {
        // Live text: owners (CursorPopup) may rewrite the tooltip when
        // shortcuts are reconfigured; the hover handler reads the
        // current value at show time.
        button._hoverTooltipText = text;
        button.connect('enter-event', () => {
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                SEARCH_TOOLTIP_DELAY_MS, () => {
                    this._pendingSearchTooltips.delete(id);
                    this._positionSearchTooltip(tooltip, button, container,
                        button._hoverTooltipText ?? text);
                    return GLib.SOURCE_REMOVE;
                });
            this._pendingSearchTooltips.add(id);
        });
        const dismiss = () => {
            this.cancelPendingSearchTooltips();
            this.hideSearchTooltip(tooltip);
        };
        button.connect('leave-event', dismiss);
        // Clicking dismisses any pending/visible tooltip; the toggle
        // itself is handled by the separately bound press/clicked
        // handlers (this one deliberately does not stop propagation).
        button.connect('button-press-event', dismiss);
    }

    /**
     * Hide the shared search-toggle tooltip, if visible.
     */
    hideSearchTooltip(tooltip) {
        if (tooltip)
            tooltip.visible = false;
    }

    /**
     * Bind a toggle callback to a search button.
     * Item rows in this popup select via 'button-press-event', which is
     * the proven-delivering signal under the modal grab; plain 'clicked'
     * alone has been observed to never arrive. Both are wired so at least
     * one fires, with a short dedup window so a press+clicked pair only
     * toggles once.
     */
    _bindSearchToggle(button, onToggle) {
        let lastFire = 0;
        const fire = () => {
            const now = Date.now();
            if (now - lastFire < 300)
                return;
            lastFire = now;
            onToggle();
        };
        button.connect('clicked', fire);
        button.connect('button-press-event', () => {
            fire();
            return Clutter.EVENT_STOP;
        });
    }

    /**
     * Sync a search toggle button's visual state.
     * @param {St.Button} button
     * @param {boolean} active
     */
    setSearchToggleState(button, active) {
        if (!button)
            return;
        button.checked = !!active;
        if (active)
            button.add_style_class_name('active');
        else
            button.remove_style_class_name('active');
    }

    /**
     * Create the search field: a single field-styled bar holding the text
     * entry plus two icon-style toggles ("Aa" case-sensitive, ".*"
     * regex) embedded at the right, inside the field. The whole bar is
     * hidden until search mode is enabled, mirroring the old
     * entry-only behavior.
     * @param {Function} onTextChanged - callback(queryText)
     * @param {Function} onKeyPress - callback(event) => Clutter.EVENT_*
     * @param {Function} onCaseToggle - callback()
     * @param {Function} onRegexToggle - callback()
     * @param {St.Widget} container - fullscreen modal container hosting
     *   the popup; the floating hover tooltip is positioned relative to
     *   it (callers must add the returned tooltip to it).
     * @returns {{ searchBar: St.BoxLayout, entry: St.Entry, caseButton: St.Button, regexButton: St.Button, tooltip: St.Label }}
     */
    createSearchBar(onTextChanged, onKeyPress, onCaseToggle, onRegexToggle, container) {
        const searchBar = new St.BoxLayout({
            style_class: 'waytoclip-search-bar',
            vertical: false,
            visible: false,
            x_expand: true,
        });

        const entry = this.createSearchEntry(onTextChanged, onKeyPress);
        entry.visible = true;
        entry.x_expand = true;

        const caseButton = this.createSearchToggleButton('Aa');
        const regexButton = this.createSearchToggleButton('.*');

        this._bindSearchToggle(caseButton, onCaseToggle);
        this._bindSearchToggle(regexButton, onRegexToggle);

        // Custom hover tooltips ("Match Case (Alt+C)", ...). Native St
        // tooltips do not render here, so a shared floating label is
        // shown above the hovered toggle instead.
        const tooltip = this.createSearchTooltip();
        if (container) {
            this.attachSearchTooltip(caseButton,
                _('Match Case (Alt+C)'), tooltip, container);
            this.attachSearchTooltip(regexButton,
                _('Use Regular Expression (Alt+R)'), tooltip, container);
        }

        searchBar.add_child(entry);
        searchBar.add_child(caseButton);
        searchBar.add_child(regexButton);

        // Highlight the field while typing (the container draws the
        // field chrome; the nested entry itself is transparent).
        const text = entry.get_clutter_text();
        text.connect('key-focus-in', () => searchBar.add_style_class_name('focus'));
        text.connect('key-focus-out', () => searchBar.remove_style_class_name('focus'));

        return { searchBar, entry, caseButton, regexButton, tooltip };
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
     * Hints are reactive so the shared floating hover tooltip can be
     * attached (see attachSearchTooltip).
     * @param {St.Widget} container - fullscreen modal container the
     *   shared tooltip is positioned relative to (omit to skip tooltips).
     * @param {St.Label} tooltip - shared floating tooltip label.
     * @returns {{ footerBox: St.BoxLayout, searchHint: St.BoxLayout,
      *   searchHintLabel: St.Label, privateModeHint: St.BoxLayout,
      *   privateModeHintLabel: St.Label, deleteHint: St.BoxLayout,
      *   deleteHintLabel: St.Label, pageIndicator: St.Label }}
     */
    createFooter(container, tooltip) {
        const searchHint = new St.BoxLayout({
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.START,
            reactive: true,
            track_hover: true,
        });
        const searchIcon = new St.Icon({
            icon_name: 'system-search-symbolic',
        });
        const searchHintLabel = new St.Label({ text: ' = s' });
        searchHint.add_child(searchIcon);
        searchHint.add_child(searchHintLabel);

        const privateModeHint = new St.BoxLayout({
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.START,
            reactive: true,
            track_hover: true,
        });
        const privateIcon = new St.Icon({
            icon_name: 'security-medium-symbolic',
        });
        const privateModeHintLabel = new St.Label({ text: ' = p' });
        privateModeHint.add_child(privateIcon);
        privateModeHint.add_child(privateModeHintLabel);

        const deleteHint = new St.BoxLayout({
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.END,
            reactive: true,
            track_hover: true,
        });
        const deleteIcon = new St.Icon({
            icon_name: 'user-trash-symbolic',
        });
        const deleteHintLabel = new St.Label({ text: ' = d' });
        deleteHint.add_child(deleteIcon);
        deleteHint.add_child(deleteHintLabel);

        if (container && tooltip) {
            this.attachSearchTooltip(searchHint,
                _('Toggle search (s)'), tooltip, container);
            this.attachSearchTooltip(privateModeHint,
                _('Toggle private mode (p)'), tooltip, container);
            this.attachSearchTooltip(deleteHint,
                _('Delete selected entry (d)'), tooltip, container);
        }

        const pageIndicator = this.createPageIndicator();

        const footerBox = new St.BoxLayout({ x_expand: true });
        footerBox.add_child(searchHint);
        footerBox.add_child(privateModeHint);
        footerBox.add_child(pageIndicator);
        footerBox.add_child(deleteHint);

        return {
            footerBox, searchHint, searchHintLabel, privateModeHint,
            privateModeHintLabel, deleteHint, deleteHintLabel, pageIndicator,
        };
    }

    /**
     * Create the placeholder label shown in place of the entry list when
     * there is nothing to display (empty history or no search matches).
     */
    createEmptyLabel(text) {
        return new St.Label({
            style_class: 'waytoclip-empty-label',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            text,
        });
    }

    /**
     * Build a small thumbnail actor for an image entry, or null when the
     * entry is not an image / has no decodable bytes. Uses a BytesIcon so
     * no cache-file roundtrip is needed (works even before/independently
     * of the on-disk image cache).
     */
    createImagePreview(entry) {
        // Best-effort thumbnail: undecodable bytes yield no preview.
        try {
            if (!entry || !entry.isImage())
                return null;
            const bytes = entry.asBytes();
            if (bytes.get_size() === 0)
                return null;
            const gicon = Gio.BytesIcon.new(bytes);
            return new St.Icon({
                gicon,
                icon_size: this._imagePreviewSize,
                style_class: 'waytoclip-item-image',
                x_align: Clutter.ActorAlign.START,
            });
        } catch (_e) {
            return null;
        }
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

        const imagePreview = this.createImagePreview(mItem.entry);
        if (imagePreview) {
            textContainer.add_child(imagePreview);
        } else {
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
        }
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
     * Initial placement near the cursor. Prioritizes BELOW the cursor when
     * the popup fits there; only pops upwards when there is not enough
     * space below but there is enough above. When neither side fits, uses
     * the side with the most available space so the scrollable list gets
     * maximum height. Left edge starts at the cursor and is clamped once
     * — callers lock the returned X and cursor-anchored edge and must
     * never recompute placement on page changes.
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
            // Neither side fits: use the side with the most available
            // space so the (scrollable) list gets maximum height. Ties
            // keep the preferred below-mode. Callers cap the list to the
            // locked side's available space, so nothing paints off-screen.
            if (spaceAbove > spaceBelow) {
                mode = 'above';
                popupY = aboveBottomY - natH;
            } else {
                mode = 'below';
                popupY = belowTopY;
            }
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
