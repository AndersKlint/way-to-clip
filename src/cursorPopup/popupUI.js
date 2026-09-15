import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as nativeGettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { makeTranslator } from '../common/i18n.js';

const _ = makeTranslator(nativeGettext);
const IMAGE_PREVIEW_SIZE = 96;

export const POPUP_GEOMETRY = {
    MARGIN: 10,
    GAP_BELOW: 20,
    GAP_ABOVE: 10,
};

// Approx. characters per visual line in the popup (400-600px wide).
// Used to detect multi-line clipping that max-height CSS would otherwise
// cut off silently, so we can append an ellipsis.
export const POPUP_PREVIEW_CHARS_PER_LINE = 60;
export const POPUP_PREVIEW_ELLIPSIS = ' ...';

export function truncatePreviewText(text, maxLines = 3) {
    if (text === null || text === undefined)
        return '';
    const str = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (str === '')
        return '';
    const lines = Number.isFinite(maxLines)
        ? Math.min(3, Math.max(1, Math.floor(maxLines)))
        : 3;

    let preview;
    let truncated = false;
    if (lines <= 1) {
        // single-row previews collapse newlines so short multi-line clips
        // still fit on one visual line without a false ellipsis
        preview = str.split('\n').join(' ');
    } else {
        let parts = str.split('\n');
        if (parts.length > lines) {
            parts = parts.slice(0, lines);
            truncated = true;
        }
        preview = parts.join('\n');
        if (!truncated && preview !== str && str.length > preview.length)
            truncated = true;
    }

    const maxChars = lines * POPUP_PREVIEW_CHARS_PER_LINE;
    if (preview.length > maxChars) {
        preview = preview.slice(0, maxChars).replace(/\s+$/, '');
        truncated = true;
    }

    if (truncated) {
        preview = preview.replace(/\s+$/, '');
        if (!preview.endsWith('...'))
            preview += POPUP_PREVIEW_ELLIPSIS;
    }
    return preview;
}

const SEARCH_TOOLTIP_DELAY_MS = 500;
const SEARCH_TOGGLE_DEBOUNCE_MS = 300;

export class PopupUIBuilder {
    #imagePreviewSize = IMAGE_PREVIEW_SIZE;
    #pendingSearchTooltips = new Set();
    #hoverTooltipTexts = new WeakMap();

    setImagePreviewSize(size) {
        if (!Number.isFinite(size))
            return;
        this.#imagePreviewSize = Math.min(512, Math.max(32, Math.round(size)));
    }

    destroy() {
        this.cancelPendingSearchTooltips();
    }

    cancelPendingSearchTooltips() {
        for (const id of this.#pendingSearchTooltips)
            GLib.source_remove(id);
        this.#pendingSearchTooltips.clear();
    }

    setHoverTooltipText(actor, text) {
        this.#hoverTooltipTexts.set(actor, text);
    }

    getHoverTooltipText(actor, fallback) {
        return this.#hoverTooltipTexts.get(actor) ?? fallback;
    }

    // set_policy is 47+, older shells use the properties
    setScrollPolicies(scrollView, hPolicy, vPolicy) {
        if (typeof scrollView.set_policy === 'function')
            scrollView.set_policy(hPolicy, vPolicy);
        else {
            scrollView.hscrollbar_policy = hPolicy;
            scrollView.vscrollbar_policy = vPolicy;
        }
    }

    createModalContainer() {
        return new St.Widget({
            reactive: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
        });
    }

    createPopupLayout() {
        return new St.BoxLayout({
            style_class: 'waytoclip-cursor-popup',
            vertical: true,
            reactive: true,
        });
    }

    createListContainer() {
        return new St.BoxLayout({
            style_class: 'waytoclip-popup-list',
            vertical: true,
        });
    }

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

    createSearchEntry(onTextChanged, onKeyPress) {
        const entry = new St.Entry({
            style_class: 'waytoclip-search-entry',
            hint_text: _('Search...'),
            visible: false,
            x_expand: true,
        });

        entry.get_clutter_text().connect('text-changed', actor => {
            onTextChanged(actor.get_text());
        });

        entry.get_clutter_text().connect('key-press-event', (_actor, event) => {
            return onKeyPress(event);
        });

        return entry;
    }

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

    // shared floating tooltip (native ones don't render here)
    createSearchTooltip() {
        return new St.Label({
            style_class: 'waytoclip-search-tooltip',
            visible: false,
        });
    }

    #positionSearchTooltip(tooltip, button, container, text) {
        tooltip.set_text(text);
        container.set_child_above_sibling(tooltip, null);
        // show first so size is right, then place (no flash in between)
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

    attachSearchTooltip(button, text, tooltip, container) {
        // read live at show time, owners rewrite this when shortcuts change
        this.setHoverTooltipText(button, text);
        button.connect('enter-event', () => {
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                SEARCH_TOOLTIP_DELAY_MS, () => {
                    this.#pendingSearchTooltips.delete(id);
                    this.#positionSearchTooltip(tooltip, button, container,
                        this.getHoverTooltipText(button, text));
                    return GLib.SOURCE_REMOVE;
                });
            this.#pendingSearchTooltips.add(id);
        });
        const dismiss = () => {
            this.cancelPendingSearchTooltips();
            this.hideSearchTooltip(tooltip);
        };
        button.connect('leave-event', dismiss);
        // press just dismisses, toggle itself is wired separately
        button.connect('button-press-event', dismiss);
    }

    hideSearchTooltip(tooltip) {
        if (tooltip)
            tooltip.visible = false;
    }

    // rows use press-event (clicked often never arrives under the grab) + dedup
    #bindSearchToggle(button, onToggle) {
        let lastFire = 0;
        const fire = () => {
            const now = Date.now();
            if (now - lastFire < SEARCH_TOGGLE_DEBOUNCE_MS)
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

    setSearchToggleState(button, active) {
        if (!button)
            return;
        button.checked = !!active;
        if (active)
            button.add_style_class_name('active');
        else
            button.remove_style_class_name('active');
    }

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

        this.#bindSearchToggle(caseButton, onCaseToggle);
        this.#bindSearchToggle(regexButton, onRegexToggle);

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

        const text = entry.get_clutter_text();
        text.connect('key-focus-in', () => searchBar.add_style_class_name('focus'));
        text.connect('key-focus-out', () => searchBar.remove_style_class_name('focus'));

        return { searchBar, entry, caseButton, regexButton, tooltip };
    }

    createPageIndicator() {
        return new St.Label({
            style_class: 'waytoclip-page-indicator',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
    }

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

        const favoriteHint = new St.BoxLayout({
            style_class: 'waytoclip-hint',
            x_align: Clutter.ActorAlign.END,
            reactive: true,
            track_hover: true,
        });
        const favoriteIcon = new St.Icon({
            icon_name: 'starred-symbolic',
        });
        const favoriteHintLabel = new St.Label({ text: ' = f' });
        favoriteHint.add_child(favoriteIcon);
        favoriteHint.add_child(favoriteHintLabel);

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
            this.attachSearchTooltip(favoriteHint,
                _('Toggle favorite (f)'), tooltip, container);
            this.attachSearchTooltip(deleteHint,
                _('Delete selected entry (d)'), tooltip, container);
        }

        const pageIndicator = this.createPageIndicator();

        const footerBox = new St.BoxLayout({ x_expand: true });
        footerBox.add_child(searchHint);
        footerBox.add_child(privateModeHint);
        footerBox.add_child(pageIndicator);
        footerBox.add_child(favoriteHint);
        footerBox.add_child(deleteHint);

        return {
            footerBox, searchHint, searchHintLabel, privateModeHint,
            privateModeHintLabel, favoriteHint, favoriteHintLabel,
            deleteHint, deleteHintLabel, pageIndicator,
        };
    }

    createFavoritesRow({ isBack, onActivate }) {
        const row = new St.BoxLayout({
            style_class: 'waytoclip-popup-item waytoclip-favorites-row',
            reactive: true,
            x_expand: true,
            track_hover: true,
            vertical: false,
        });
        const icon = new St.Icon({
            icon_name: isBack ? 'go-previous-symbolic' : 'folder-symbolic',
            style_class: 'waytoclip-favorites-icon',
        });
        const label = new St.Label({
            text: isBack ? _('Back') : _('Favorites'),
            style_class: 'waytoclip-item-text',
            y_align: Clutter.ActorAlign.START,
            x_expand: true,
        });
        row.add_child(icon);
        row.add_child(label);
        row.connect('button-press-event', () => {
            onActivate();
            return Clutter.EVENT_STOP;
        });
        return { row, icon, label };
    }

    createEmptyLabel(text) {
        return new St.Label({
            style_class: 'waytoclip-empty-label',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            text,
        });
    }

    createImagePreview(entry) {
        if (!entry || !entry.isImage())
            return null;
        let bytes = null;
        try {
            bytes = entry.asBytes();
        } catch {
            return null;
        }
        if (!bytes || bytes.get_size() === 0)
            return null;
        const gicon = Gio.BytesIcon.new(bytes);
        return new St.Icon({
            gicon,
            icon_size: this.#imagePreviewSize,
            style_class: 'waytoclip-item-image',
            x_align: Clutter.ActorAlign.START,
        });
    }

    // one clipboard row (maxLines lets us squeeze rows instead of moving the popup)
    // shortcutLabel is the configured shortcut for this slot, empty when unbound
    createItemWidget(entry, index, onSelect, maxLines = 3, shortcutLabel = null) {
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

        const numberText = shortcutLabel ?? `${(index + 1) % 10}`;
        const numberLabel = new St.Label({
            text: numberText ? `${numberText}. ` : '',
            style_class: 'waytoclip-item-number',
            y_align: Clutter.ActorAlign.START,
        });

        const textContainer = new St.BoxLayout({
            style_class: 'waytoclip-item-text-container',
            vertical: true,
            x_expand: true,
        });

        const imagePreview = this.createImagePreview(entry);
        if (imagePreview) {
            textContainer.add_child(imagePreview);
        } else {
            const textLabel = new St.Label({
                text: truncatePreviewText(entry.getStringValue(), maxLines),
                style_class: 'waytoclip-item-text',
                y_align: Clutter.ActorAlign.START,
                x_expand: true,
            });
            textLabel.get_clutter_text().set_line_wrap(true);
            textLabel.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
            textLabel.get_clutter_text().set_ellipsize(Pango.EllipsizeMode.END);
            // squeeze tall rows: inline style beats the stylesheet here
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
            onSelect(entry);
            return Clutter.EVENT_STOP;
        });

        return itemBox;
    }

    // Prioritize below if it fits, else above if it fits, else whichever side is bigger.
    // x, y are stage coords, same as positionPopup takes.
    decidePopupSide(natH, y, monitor) {
        const { MARGIN, GAP_BELOW, GAP_ABOVE } = POPUP_GEOMETRY;

        const relY = y - monitor.y;
        const spaceBelow = monitor.height - relY - GAP_BELOW - MARGIN;
        const spaceAbove = relY - GAP_ABOVE - MARGIN;

        if (natH <= spaceBelow)
            return 'below';
        if (natH <= spaceAbove)
            return 'above';
        return spaceAbove > spaceBelow ? 'above' : 'below';
    }

    positionPopup(modalContainer, popup, x, y, monitor) {
        const { MARGIN, GAP_BELOW, GAP_ABOVE } = POPUP_GEOMETRY;

        const [, natW] = popup.get_preferred_width(-1);
        const [, natH] = popup.get_preferred_height(natW);

        modalContainer.set_position(monitor.x, monitor.y);
        modalContainer.set_size(monitor.width, monitor.height);

        const relX = x - monitor.x;
        const relY = y - monitor.y;

        const popupX = Math.max(MARGIN, Math.min(relX, monitor.width - natW - MARGIN));

        const belowTopY = relY + GAP_BELOW;
        const aboveBottomY = relY - GAP_ABOVE;

        const mode = this.decidePopupSide(natH, y, monitor);
        let popupY;
        if (mode === 'below') {
            popupY = belowTopY;
        } else {
            popupY = aboveBottomY - natH;
        }

        popup.set_position(popupX, popupY);

        return { x: popupX, y: popupY, mode, belowTopY, aboveBottomY };
    }

    // re-glue after content changes, so the popup doesn't jump around
    anchorPopup(modalContainer, popup, lock, monitor, natH = null) {
        const { MARGIN } = POPUP_GEOMETRY;

        modalContainer.set_position(monitor.x, monitor.y);
        modalContainer.set_size(monitor.width, monitor.height);

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

    availHeightForLock(lock, monitor) {
        const { MARGIN } = POPUP_GEOMETRY;
        if (!lock || !monitor)
            return Infinity;
        if (lock.mode === 'above')
            return Math.max(0, lock.aboveBottomY - MARGIN);
        return Math.max(0, monitor.height - lock.belowTopY - MARGIN);
    }

    measurePopup(popup, monitor, lockedX) {
        const { MARGIN } = POPUP_GEOMETRY;
        const [, natW] = popup.get_preferred_width(-1);
        const availableW = Math.max(0, monitor.width - lockedX - MARGIN);
        const effW = Math.min(natW, availableW);
        const [, natH] = popup.get_preferred_height(effW);
        return { natW, natH, availableW };
    }
}
