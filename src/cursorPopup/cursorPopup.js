import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { PopupUIBuilder } from './popupUI.js';
import { PopupSearch } from './popupSearch.js';
import { PopupKeyHandler } from './popupKeyHandler.js';
import { PopupLocalShortcuts } from './popupLocalShortcuts.js';
import { PopupSearchController } from './popupSearchController.js';
import { PopupSelectionController } from './popupSelectionController.js';
import { PopupLayoutPlacer } from './popupLayoutPlacer.js';

export class CursorPopup {
    // handlers are callbacks into the controller. Popup never touches the store directly.
    #handlers = null;
    #uiBuilder = null;
    #search = null;
    #keyHandler = null;
    #localShortcuts = null;
    #searchController = null;
    #selectionController = null;
    #layoutPlacer = null;
    #ui = null;
    #modalGrab = null;

    get ui() {
        return this.#ui;
    }

    attachUI(ui) {
        this.#ui = ui;
    }

    detachUI() {
        this.#ui = null;
    }

    constructor(handlers) {
        this.#handlers = handlers;
        this.#uiBuilder = new PopupUIBuilder();
        this.#search = new PopupSearch();
        this.#localShortcuts = new PopupLocalShortcuts({ uiBuilder: this.#uiBuilder });
        this.#searchController = new PopupSearchController({
            model: this.#search,
            shortcuts: this.#localShortcuts,
            uiBuilder: this.#uiBuilder,
            handlers,
            popup: this,
        });
        this.#selectionController = new PopupSelectionController({
            handlers,
            popup: this,
            search: this.#searchController,
        });
        this.#keyHandler = new PopupKeyHandler({
            popup: this,
            shortcuts: this.#localShortcuts,
            search: this.#searchController,
            selection: this.#selectionController,
        });
        this.#layoutPlacer = new PopupLayoutPlacer({
            uiBuilder: this.#uiBuilder,
            popup: this,
            selection: this.#selectionController,
            search: this.#searchController,
            shortcuts: this.#localShortcuts,
            keyHandler: this.#keyHandler,
        });
        this.#searchController.setSelection(this.#selectionController);
        this.#searchController.setPlacer(this.#layoutPlacer);

        this.#ui = null;
        this.#modalGrab = null;
    }

    applySettings(prefs) {
        this.#searchController.applySettings(prefs);
        this.#localShortcuts.applySettings(prefs);
        this.#selectionController.applySettings(prefs);
        this.#layoutPlacer.syncSettingsUI();
        this.#uiBuilder.setImagePreviewSize(prefs.imagePreviewSize);
    }

    isOpen() {
        return this.#ui !== null;
    }

    open(x, y, entries, monitor) {
        this.#selectionController.reset(entries);
        this.#searchController.reset();

        this.#layoutPlacer.buildUI();

        const ui = this.#ui;
        ui.modalContainer.add_child(ui.popupLayout);
        // last = on top for the hover tooltip
        ui.modalContainer.add_child(ui.searchTooltip);
        global.stage.add_child(ui.modalContainer);

        // stage before measuring: off-stage widgets get unthemed sizes and spam theme-node warnings
        this.#layoutPlacer.firstPosition(x, y, monitor);

        // clicks inside stop here, clicks outside hit the container below and close the popup
        ui.popupLayout.connect('button-press-event', () => {
            return Clutter.EVENT_STOP;
        });

        // anything reaching the container was outside -> dismiss
        ui.modalContainer.connect('button-press-event', () => {
            this.close();
            return Clutter.EVENT_STOP;
        });

        ui.popupLayout.connect('key-press-event',
            this.#keyHandler.handleMainKeyPress.bind(this.#keyHandler));

        // fit now so first frame is already right, idle double-checks after layout
        this.renderPage();
        this.updatePrivateModeState();

        this.#modalGrab = Main.pushModal(ui.modalContainer);
        global.stage.set_key_focus(ui.popupLayout);
    }

    close() {
        if (!this.#ui)
            return;

        this.#uiBuilder.cancelPendingSearchTooltips();
        if (this.#modalGrab) {
            Main.popModal(this.#modalGrab);
            this.#modalGrab = null;
        }

        if (this.#ui.modalContainer) {
            global.stage.remove_child(this.#ui.modalContainer);
            // container destroy drops the subtree, never disconnect its signals
            this.#ui.modalContainer.destroy();
        }

        this.detachUI();
        this.#layoutPlacer.clearContext();
        this.#selectionController.reset([]);
    }

    destroy() {
        this.close();
        this.#uiBuilder.destroy();
        this.#layoutPlacer.destroy();
        this.#handlers = null;
    }

    togglePrivateMode() {
        this.#handlers.onTogglePrivateMode();
    }

    updatePrivateModeState() {
        if (!this.#ui?.privateModeHint)
            return;
        if (this.#handlers.onIsPrivateMode()) {
            this.#ui.privateModeHint.add_style_class_name('active');
        } else {
            this.#ui.privateModeHint.remove_style_class_name('active');
        }
    }

    updateFavoriteHint() {
        this.#layoutPlacer.updateFavoriteHint();
    }

    renderPage() {
        this.#layoutPlacer.renderPage();
    }
}
