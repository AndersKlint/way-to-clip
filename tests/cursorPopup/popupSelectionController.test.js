import {HistoryStore} from '../../src/history/historyStore.js';
import {PopupSelectionController} from '../../src/cursorPopup/popupSelectionController.js';
import {assert, fakeEntry, test} from '../testHarness.js';

function makeFavSelection(handlers = {}) {
    const sel = new PopupSelectionController({
        handlers,
        popup: {renderPage() {}, updateFavoriteHint() {}},
        search: {isSearchMode: false, query: ''},
    });
    sel.applySettings({limitPopupPages: false, maxPopupPages: 3, favoritesEnabled: true});
    return sel;
}

{
    const sel = new PopupSelectionController({handlers: {}, popup: {}, search: {}});
    const a = fakeEntry('a');
    const b = fakeEntry('b');
    const c = fakeEntry('c');
    const input = [a, b, c];
    sel.reset(input);
    assert(input[0] === a && input[2] === c, 'selection reset keeps input order');
    const page = sel.getCurrentPageState();
    assert(page.entries.length === 3 && page.entries[0] === c && page.entries[2] === a,
        'selection shows newest first');
}

{
    // bubbled entries must land on top, not the last page
    const store = new HistoryStore();
    const a = fakeEntry('a');
    const b = fakeEntry('b');
    store.load([a, b]);
    store.select(a, {moveFirst: true});
    const sel = new PopupSelectionController({handlers: {}, popup: {}, search: {}});
    sel.reset(store.entries);
    assert(sel.getCurrentPageState().entries[0] === a,
        'selection shows bubbled entry on top');
}

{
    // favorites view lists newest first, just like the main list
    const sel = makeFavSelection();
    const a = fakeEntry('a', true);
    const b = fakeEntry('b');
    const c = fakeEntry('c', true);
    sel.reset([a, b, c]);
    sel.toggleFavoritesView();
    const page = sel.getCurrentPageState();
    assert(page.entries.length === 2 && page.entries[0] === c && page.entries[1] === a,
        'favorites view shows newest first');
    sel.toggleFavoritesView();
    const back = sel.getCurrentPageState();
    assert(!sel.isFavoritesView && back.entries.length === 3 && back.entries[0] === c,
        'leaving favorites restores the full newest-first list');
}

{
    // pasting a favorite from the favorites view puts it on top there too
    const store = new HistoryStore();
    const a = fakeEntry('a', true);
    const b = fakeEntry('b');
    const c = fakeEntry('c', true);
    store.load([a, b, c]);
    store.select(a, {moveFirst: true});
    const sel = makeFavSelection();
    sel.reset(store.entries);
    sel.toggleFavoritesView();
    assert(sel.getCurrentPageState().entries[0] === a,
        'pasted favorite lands on top of favorites view');
}

{
    // toggling follows the entry instead of jumping elsewhere
    const backing = [fakeEntry('a', true), fakeEntry('b'), fakeEntry('c')];
    const sel = makeFavSelection({
        onToggleFavorite(target) {
            target.favorite = !target.isFavorite();
        },
        onGetEntries: () => [...backing],
    });
    sel.reset([...backing]);
    sel.toggleFavoriteSelected();
    assert(sel.itemsToShow[0].getStringValue() === 'c' && sel.selectedIndex === 0,
        'toggling favorite keeps order and selection');
    assert(sel.getSelectedEntry().isFavorite(),
        'toggled entry is marked favorite');
}

{
    // deleting must keep newest-first order, not flip to store order
    const backing = [fakeEntry('a'), fakeEntry('b'), fakeEntry('c')];
    const sel = new PopupSelectionController({
        handlers: {
            onRemoveEntry(target) {
                const i = backing.indexOf(target);
                if (i >= 0)
                    backing.splice(i, 1);
            },
            onGetEntries: () => [...backing],
        },
        popup: {renderPage() {}},
        search: {isSearchMode: false},
    });
    sel.reset([...backing]);
    sel.setPageActors([{}, {}, {}]);
    sel.deleteSelectedItem();
    const page = sel.getCurrentPageState();
    assert(page.entries.length === 2 && page.entries[0].getStringValue() === 'b' &&
        page.entries[1].getStringValue() === 'a',
    'selection stays newest-first after delete');
}

test('quick select slot index picks visible item', () => {
    let picked = null;
    const backing = [fakeEntry('a'), fakeEntry('b'), fakeEntry('c')];
    const sel = new PopupSelectionController({
        handlers: {onSelectEntryFromPopup: e => {
            picked = e;
        }},
        popup: {renderPage() {}, updateFavoriteHint() {}},
        search: {isSearchMode: false, query: ''},
    });
    sel.applySettings({limitPopupPages: false, maxPopupPages: 3, favoritesEnabled: true});
    sel.reset([...backing]);
    sel.selectBySlotIndex(0);
    if (!picked || picked.getStringValue() !== 'c')
        throw new Error('slot 0 must pick newest first');
    sel.selectBySlotIndex(2);
    if (!picked || picked.getStringValue() !== 'a')
        throw new Error('slot 2 must pick third item');
    picked = null;
    sel.selectBySlotIndex(5);
    if (picked !== null)
        throw new Error('out of range slot must pick nothing');
    picked = null;
    sel.selectBySlotIndex(-1);
    if (picked !== null)
        throw new Error('negative slot must pick nothing');
    picked = null;
    sel.selectBySlotIndex(1.5);
    if (picked !== null)
        throw new Error('non-integer slot must pick nothing');
});

test('number keys map digits to newest-first slots, 0 picks tenth', () => {
    let picked = null;
    const backing = [];
    for (let i = 0; i < 10; i++)
        backing.push(fakeEntry(`e${i}`));
    const sel = new PopupSelectionController({
        handlers: {onSelectEntryFromPopup: e => {
            picked = e;
        }},
        popup: {renderPage() {}, updateFavoriteHint() {}},
        search: {isSearchMode: false, query: ''},
    });
    sel.applySettings({limitPopupPages: false, maxPopupPages: 3, favoritesEnabled: true});
    sel.reset([...backing]);
    sel.selectByNumberKey(0x31);
    if (!picked || picked.getStringValue() !== 'e9')
        throw new Error('key 1 must pick newest');
    sel.selectByNumberKey(0x35);
    if (!picked || picked.getStringValue() !== 'e5')
        throw new Error('key 5 must pick fifth newest');
    sel.selectByNumberKey(0x30);
    if (!picked || picked.getStringValue() !== 'e0')
        throw new Error('key 0 must pick tenth');
    picked = null;
    sel.selectByNumberKey(0x41);
    if (picked !== null)
        throw new Error('non-digit key must pick nothing');
});

test('paging splits newest-first list across pages', () => {
    const backing = [];
    for (let i = 0; i < 12; i++)
        backing.push(fakeEntry(`e${i}`));
    const sel = new PopupSelectionController({
        handlers: {},
        popup: {renderPage() {}, updateFavoriteHint() {}},
        search: {isSearchMode: false, query: ''},
    });
    sel.applySettings({limitPopupPages: false, maxPopupPages: 3, favoritesEnabled: true});
    sel.reset([...backing]);
    if (sel.getTotalPages() !== 2)
        throw new Error('12 entries must span 2 pages');
    const first = sel.getCurrentPageState();
    if (first.entries.length !== 10 || first.entries[0].getStringValue() !== 'e11')
        throw new Error('first page must hold 10 newest');
    sel.navigatePageForward();
    const second = sel.getCurrentPageState();
    if (second.entries.length !== 2 || second.entries[0].getStringValue() !== 'e1')
        throw new Error('second page must hold oldest remainder');
    sel.navigatePageForward();
    if (sel.currentPage !== 0)
        throw new Error('paging forward must wrap');
    sel.navigatePageBack();
    if (sel.currentPage !== 1)
        throw new Error('paging back must wrap');
});

test('page limit truncates visible items', () => {
    const backing = [];
    for (let i = 0; i < 12; i++)
        backing.push(fakeEntry(`e${i}`));
    const sel = new PopupSelectionController({
        handlers: {},
        popup: {renderPage() {}, updateFavoriteHint() {}},
        search: {isSearchMode: false, query: ''},
    });
    sel.applySettings({limitPopupPages: true, maxPopupPages: 1, favoritesEnabled: true});
    sel.reset([...backing]);
    if (sel.itemsToShow.length !== 10)
        throw new Error('one page limit must show 10');
    if (sel.getTotalPages() !== 1)
        throw new Error('limited list must fit one page');
});

test('confirmSelection pastes highlighted entry', () => {
    let picked = null;
    const sel = new PopupSelectionController({
        handlers: {onSelectEntryFromPopup: e => {
            picked = e;
        }},
        popup: {renderPage() {}, updateFavoriteHint() {}},
        search: {isSearchMode: false, query: ''},
    });
    sel.applySettings({limitPopupPages: false, maxPopupPages: 3, favoritesEnabled: true});
    sel.reset([fakeEntry('a'), fakeEntry('b')]);
    sel.confirmSelection();
    if (!picked || picked.getStringValue() !== 'b')
        throw new Error('confirm must paste newest first');
});

test('confirmSelection on favorites row opens favorites view', () => {
    const actor = () => ({add_style_class_name() {}, remove_style_class_name() {}});
    const sel = makeFavSelection();
    sel.reset([fakeEntry('a', true), fakeEntry('b')]);
    sel.setPageActors([actor(), actor(), actor()]);
    sel.navigateDown();
    sel.navigateDown();
    if (!sel.isFavoritesRowSelected())
        throw new Error('two downs must land on favorites row');
    sel.confirmSelection();
    if (!sel.isFavoritesView)
        throw new Error('confirm on favorites row must open favorites view');
});

test('navigation wraps around page actors', () => {
    const actor = () => ({add_style_class_name() {}, remove_style_class_name() {}});
    const sel = makeFavSelection();
    sel.reset([fakeEntry('a'), fakeEntry('b')]);
    sel.setPageActors([actor(), actor()]);
    if (sel.selectedIndex !== 0)
        throw new Error('reset must highlight first row');
    sel.navigateDown();
    if (sel.selectedIndex !== 1)
        throw new Error('down must advance');
    sel.navigateDown();
    if (sel.selectedIndex !== 0)
        throw new Error('down must wrap');
    sel.navigateUp();
    if (sel.selectedIndex !== 1)
        throw new Error('up must wrap');
});

test('favorite toggle ignored when favorites disabled', () => {
    let toggled = false;
    const sel = new PopupSelectionController({
        handlers: {onToggleFavorite: () => {
            toggled = true;
        }},
        popup: {renderPage() {}, updateFavoriteHint() {}},
        search: {isSearchMode: false, query: ''},
    });
    sel.applySettings({limitPopupPages: false, maxPopupPages: 3, favoritesEnabled: false});
    sel.reset([fakeEntry('a')]);
    sel.toggleFavoriteSelected();
    if (toggled)
        throw new Error('disabled favorites must not toggle');
    if (sel.isFavoritesRowSelected())
        throw new Error('disabled favorites must never select favorites row');
});

test('deleting last entry empties selection without favorites row', () => {
    const backing = [fakeEntry('solo')];
    const sel = new PopupSelectionController({
        handlers: {
            onRemoveEntry(target) {
                const i = backing.indexOf(target);
                if (i >= 0)
                    backing.splice(i, 1);
            },
            onGetEntries: () => [...backing],
        },
        popup: {renderPage() {}, updateFavoriteHint() {}},
        search: {isSearchMode: false, query: ''},
    });
    sel.applySettings({limitPopupPages: false, maxPopupPages: 3, favoritesEnabled: false});
    sel.reset([...backing]);
    sel.setPageActors([{}]);
    sel.deleteSelectedItem();
    if (sel.itemsToShow.length !== 0)
        throw new Error('list must empty');
    if (sel.selectedIndex !== -1)
        throw new Error('empty list must clear highlight');
    if (sel.getTotalPages() !== 1)
        throw new Error('empty list must report one page');
});

test('favorites search source lists favorites only', () => {
    const sel = makeFavSelection();
    const a = fakeEntry('a', true);
    sel.reset([a, fakeEntry('b'), fakeEntry('c', true)]);
    const all = sel.getSearchSource();
    if (all.length !== 3)
        throw new Error('main source must list everything');
    sel.toggleFavoritesView();
    const favs = sel.getSearchSource();
    if (favs.length !== 2 || !favs.includes(a))
        throw new Error('favorites source must list favorites only');
});

test('navigation follows selection without adjustment errors', () => {
    const adjustment = {page_size: 20, upper: 100, lower: 0, value: 0};
    const rowActor = rowTop => ({
        add_style_class_name() {},
        remove_style_class_name() {},
        get_position() {
            return [true, rowTop];
        },
        get_height() {
            return 10;
        },
    });
    let hintCalls = 0;
    const sel = new PopupSelectionController({
        handlers: {},
        popup: {
            renderPage() {},
            updateFavoriteHint() {
                hintCalls += 1;
            },
            ui: {listScrollView: {get_vadjustment: () => adjustment}},
        },
        search: {isSearchMode: false, query: ''},
    });
    sel.applySettings({limitPopupPages: false, maxPopupPages: 3, favoritesEnabled: false});
    sel.reset([fakeEntry('a'), fakeEntry('b'), fakeEntry('c')]);
    sel.setPageActors([rowActor(0), rowActor(40), rowActor(80)]);
    sel.navigateDown();
    sel.navigateDown();
    sel.navigateUp();
    if (sel.selectedIndex !== 1)
        throw new Error('property style navigation must land on second row');
    if (hintCalls !== 3)
        throw new Error('scroll follow must not abort hint updates');
});
