import GLib from 'gi://GLib';
import St from 'gi://St';

import { gettext as nativeGettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { makeTranslator } from '../common/i18n.js';
import { ITEMS_PER_PAGE } from '../common/constants.js';

const _ = makeTranslator(nativeGettext);

const DEFAULT_LINES_PER_ITEM = 3;
const MIN_LINES_PER_ITEM = 1;

// This class handles popup geometry, i.e. building rows, fitting them to the lock area, anchoring,
// and repositioning after layout. Item data comes from the selection module.
export class PopupLayoutPlacer {
    #uiBuilder;
    #popup;
    #selection;
    #search;
    #shortcuts;
    #keyHandler;

    // Left edge + cursor edge stay put after open, rest can move.
    // This is to anchor the popup to the popup position, even if its resized on page changes
    #popupLock = null;
    #monitor = null;
    #anchorX = 0;
    #anchorY = 0;

    // defines how many text lines high each list item should be at max. This is used to determine if the popup fits on screen, and will shrink if needed.
    #linesPerItem = DEFAULT_LINES_PER_ITEM;

    #repositionIdleId = 0;

    constructor({ uiBuilder, popup, selection, search, shortcuts, keyHandler }) {
        this.#uiBuilder = uiBuilder;
        this.#popup = popup;
        this.#selection = selection;
        this.#search = search;
        this.#shortcuts = shortcuts;
        this.#keyHandler = keyHandler;
    }

    destroy() {
        this.cancelPendingReposition();
    }

    buildUI() {
        const modalContainer = this.#uiBuilder.createModalContainer();
        const popupLayout = this.#uiBuilder.createPopupLayout();
        const listContainer = this.#uiBuilder.createListContainer();
        const listScrollView = this.#uiBuilder.createListScrollView(listContainer);

        const { searchBar, entry, caseButton, regexButton, tooltip } = this.#uiBuilder.createSearchBar(
            query => this.#search.applyFilter(query),
            event => this.#keyHandler.handleSearchKeyPress(event),
            () => this.#search.toggleCaseSensitiveSearch(),
            () => this.#search.toggleRegexSearch(),
            modalContainer,
        );

        const {
            footerBox, searchHint, searchHintLabel, privateModeHint,
            privateModeHintLabel, deleteHint, deleteHintLabel, pageIndicator,
        } = this.#uiBuilder.createFooter(modalContainer, tooltip);

        // Group into one obj for easy destruction later
        this.#popup.attachUI({
            modalContainer,
            popupLayout,
            listContainer,
            listScrollView,
            searchBar,
            searchEntry: entry,
            caseButton,
            regexButton,
            searchTooltip: tooltip,
            searchHint,
            searchHintLabel,
            privateModeHint,
            privateModeHintLabel,
            deleteHint,
            deleteHintLabel,
            pageIndicator,
        });
        this.syncSettingsUI();

        const ui = this.#popup.ui;
        ui.popupLayout.add_child(ui.searchBar);
        ui.popupLayout.add_child(ui.listScrollView);
        ui.popupLayout.add_child(footerBox);
    }

    syncSettingsUI() {
        const ui = this.#popup.ui;
        if (!ui)
            return;
        this.#search.refreshToggleButtons();
        this.#shortcuts.syncHints(ui);
    }

    // initial placement: freeze the cursor edge into the lock. Runs staged so theme sizes are real.
    // Side is provisional (list is still empty), re-settled after items are built.
    firstPosition(x, y, monitor) {
        this.#anchorX = x;
        this.#anchorY = y;
        this.#monitor = monitor;

        const ui = this.#popup.ui;
        const pos = this.#uiBuilder.positionPopup(
            ui.modalContainer, ui.popupLayout, x, y, monitor
        );
        this.#popupLock = {
            x: pos.x,
            mode: pos.mode,
            belowTopY: pos.belowTopY,
            aboveBottomY: pos.aboveBottomY,
        };
        ui.popupLayout.set_height(-1);
        ui.popupLayout.set_width(-1);
    }

    renderPage() {
        this.#buildAndFitPage();
        this.scheduleReposition();
    }

    clearContext() {
        this.#popupLock = null;
        this.#monitor = null;
        this.#anchorX = 0;
        this.#anchorY = 0;
        this.#linesPerItem = DEFAULT_LINES_PER_ITEM;
        this.cancelPendingReposition();
    }

    reposition() {
        const ui = this.#popup.ui;
        if (!ui?.modalContainer || !ui?.popupLayout || !this.#monitor) return;

        if (!this.#popupLock) {
            this.#uiBuilder.positionPopup(
                ui.modalContainer,
                ui.popupLayout,
                this.#anchorX,
                this.#anchorY,
                this.#monitor,
            );
            return;
        }

        const lock = this.#popupLock;

        // Measure unbounded first, since a capped list reports a falsely small height
        this.#disableListScroll();
        this.#resetLayoutMeasure();
        const { natH } = this.#uiBuilder.measurePopup(
            ui.popupLayout, this.#monitor, lock.x);
        const availH = this.#getAvailH();

        if (natH > availH && this.#linesPerItem > MIN_LINES_PER_ITEM) {
            const h = this.#fitRowsToLock(this.#linesPerItem - 1);
            this.#anchorPopupToLock(h);
            this.scheduleReposition();
            return;
        }

        this.#anchorPopupToLock(natH);
    }

    scheduleReposition() {
        this.cancelPendingReposition();
        this.#repositionIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.#repositionIdleId = 0;
            this.reposition();
            return GLib.SOURCE_REMOVE;
        });
    }

    cancelPendingReposition() {
        if (!this.#repositionIdleId) return;

        GLib.source_remove(this.#repositionIdleId);
        this.#repositionIdleId = 0;
    }

    #buildPageItems(lines) {
        const selection = this.#selection;
        const ui = this.#popup.ui;
        ui.listContainer.destroy_all_children();
        selection.clearPageActors();

        const { entries: pageItems, selectedIndex } = selection.getCurrentPageState();

        if (pageItems.length === 0) {
            const emptyText = selection.originalCount === 0
                ? _('Clipboard history is empty')
                : _('No matching clipboard items');
            ui.listContainer.add_child(
                this.#uiBuilder.createEmptyLabel(emptyText));
        }

        for (const [index, entry] of pageItems.entries()) {
            const itemBox = this.#uiBuilder.createItemWidget(
                entry, index, item => selection.selectItem(item), lines
            );

            if (index === selectedIndex) {
                itemBox.add_style_class_name('selected');
            }

            ui.listContainer.add_child(itemBox);
            selection.appendPageActor(itemBox);
        }

        const pageCount = selection.getTotalPages();
        ui.pageIndicator.set_text(`${selection.currentPage + 1} / ${pageCount}`);
        ui.pageIndicator.visible = selection.itemsToShow.length > 0;

        this.#linesPerItem = lines;
        this.#resetListScrollTop();
    }

    #isOnStage() {
        const ui = this.#popup.ui;
        return !!(ui?.modalContainer && ui.modalContainer.get_parent());
    }

    #getAvailH() {
        return this.#uiBuilder.availHeightForLock(this.#popupLock, this.#monitor);
    }

    #fitRowsToLock(startLines) {
        const ui = this.#popup.ui;
        let h = 0;
        for (let lines = startLines; lines >= MIN_LINES_PER_ITEM; lines--) {
            this.#buildPageItems(lines);
            // uncap first so we measure the real size
            this.#disableListScroll();
            this.#resetLayoutMeasure();
            ({ natH: h } = this.#uiBuilder.measurePopup(
                ui.popupLayout, this.#monitor, this.#popupLock.x));
            if (h <= this.#getAvailH())
                break;
        }
        return h;
    }

    #setListScrollPolicy(mode) {
        const ui = this.#popup.ui;
        if (!ui.listScrollView)
            return;
        this.#uiBuilder.setScrollPolicies(
            ui.listScrollView, St.PolicyType.NEVER, mode);
    }

    #disableListScroll() {
        const ui = this.#popup.ui;
        if (!ui.listScrollView)
            return;
        this.#setListScrollPolicy(St.PolicyType.NEVER);
        ui.listScrollView.set_height(-1);
    }

    #enableListScroll(listHeight) {
        const ui = this.#popup.ui;
        if (!ui.listScrollView)
            return;
        this.#setListScrollPolicy(St.PolicyType.AUTOMATIC);
        ui.listScrollView.set_height(Math.max(0, listHeight));
    }

    #resetListScrollTop() {
        const ui = this.#popup.ui;
        if (!ui.listScrollView)
            return;
        ui.listScrollView.get_vadjustment().set_value(0);
    }

    #resetLayoutMeasure() {
        const ui = this.#popup.ui;
        ui.popupLayout.set_height(-1);
        ui.popupLayout.set_width(-1);
    }

    // The lock is the pre determined position if the left edge where the popup originates from (e.g. mouse cursor)
    #anchorPopupToLock(height) {
        const ui = this.#popup.ui;
        const availH = this.#getAvailH();
        if (height <= availH) {
            this.#disableListScroll();
            ui.popupLayout.set_height(-1);
            this.#uiBuilder.anchorPopup(
                ui.modalContainer, ui.popupLayout, this.#popupLock,
                this.#monitor, height);
            return;
        }
        // too tall even squeezed: lock the cursor edge, scroll the rows
        const { availableW } = this.#uiBuilder.measurePopup(
            ui.popupLayout, this.#monitor, this.#popupLock.x);
        const [, listNatH] = ui.listContainer.get_preferred_height(availableW);
        if (!Number.isFinite(listNatH)) {
            // measuring broke, just hard-cap so we stay on-screen
            this.#disableListScroll();
            ui.popupLayout.set_height(Math.max(0, availH));
            this.#uiBuilder.anchorPopup(
                ui.modalContainer, ui.popupLayout, this.#popupLock,
                this.#monitor, Math.max(0, availH));
            return;
        }
        const nonListH = Math.max(0, height - listNatH);
        const maxListH = Math.max(0, availH - nonListH);
        this.#enableListScroll(maxListH);
        this.#resetListScrollTop();
        ui.popupLayout.set_height(-1);
        this.#uiBuilder.anchorPopup(
            ui.modalContainer, ui.popupLayout, this.#popupLock,
            this.#monitor, Math.max(0, availH));
    }

    // try 3/2/1-line rows, anchor right away so no flicker (off-stage just builds full)
    #buildAndFitPage() {
        if (!this.#isOnStage() || !this.#popupLock || !this.#monitor) {
            this.#buildPageItems(DEFAULT_LINES_PER_ITEM);
            return;
        }

        // uncap first so we measure the real size
        this.#disableListScroll();
        const ui = this.#popup.ui;
        this.#resetLayoutMeasure();

        // the lock side came from the empty pre-items layout. Re-settle it from the
        // real height: below if it fits, else above if it fits, else biggest side.
        // Shrinking and scrolling below only kick in when neither side fits clean.
        this.#buildPageItems(DEFAULT_LINES_PER_ITEM);
        const { natH } = this.#uiBuilder.measurePopup(
            ui.popupLayout, this.#monitor, this.#popupLock.x);
        this.#popupLock.mode = this.#uiBuilder.decidePopupSide(
            natH, this.#anchorY, this.#monitor);

        const fitted = this.#fitRowsToLock(DEFAULT_LINES_PER_ITEM);
        this.#anchorPopupToLock(fitted);
    }
}
