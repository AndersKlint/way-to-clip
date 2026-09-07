/**
 * Headless unit tests for pure-logic modules.
 * Run: gjs -m tests/runTests.js   (or: make check)
 */

import { HistoryStore } from '../src/historyStore.js';
import { PopupSearch } from '../cursor-popup/popupSearch.js';
import { ITEMS_PER_PAGE } from '../constants.js';

let failures = 0;

function assert(cond, name) {
    if (cond) {
        print(`ok - ${name}`);
    } else {
        print(`FAIL - ${name}`);
        failures++;
    }
}

function fakeEntry(value, favorite = false) {
    return {
        _value: value,
        _favorite: favorite,
        isFavorite() { return this._favorite; },
        set favorite(v) { this._favorite = !!v; },
        getStringValue() { return this._value; },
        mimetype() { return 'text/plain;charset=utf-8'; },
        isText() { return true; },
        isImage() { return false; },
        equals(other) { return other && other.getStringValue?.() === this._value; },
    };
}

// --- HistoryStore ---

{
    const store = new HistoryStore();
    store.load([]);
    assert(store.length === 0 && store.selected === null, 'store loads empty');

    const a = fakeEntry('a');
    const b = fakeEntry('b');
    const c = fakeEntry('c');
    store.load([a, b, c]);
    assert(store.selected === c, 'store selects last on load');

    store.select(a);
    assert(store.selected === a, 'store select updates selection');

    store.select(a, { moveFirst: true });
    assert(store.entries[2] === a, 'store moveFirst moves to end (newest)');
}

{
    const store = new HistoryStore();
    const fav = fakeEntry('fav', true);
    const items = [fakeEntry('1'), fakeEntry('2'), fakeEntry('3'), fav];
    store.load(items);
    const removed = store.trim(2);
    assert(removed.length === 1, 'store trim removes oldest non-favorite');
    assert(store.entries.includes(fav), 'store trim preserves favorites');
    assert(store.length === 3, 'store trim respects max size');
}

{
    const store = new HistoryStore();
    const fav = fakeEntry('fav', true);
    const sel = fakeEntry('sel');
    store.load([fav, sel]);
    store.select(sel);
    const { removed, clearedClipboard } = store.clear({ keepSelected: true });
    assert(removed.length === 0, 'store clear keeps selected when asked');
    assert(clearedClipboard === false, 'store clear reports no clipboard clear');
    const res2 = store.clear({ keepSelected: false });
    assert(res2.removed.length === 1 && res2.clearedClipboard === true,
        'store clear removes selected and flags clipboard');
    assert(store.entries.length === 1 && store.entries[0] === fav,
        'store clear always preserves favorites');
}

{
    const store = new HistoryStore();
    store.load([fakeEntry('x')]);
    const persistAll = store.toPersistable({ cacheOnlyFavorite: false });
    const persistFav = store.toPersistable({ cacheOnlyFavorite: true });
    assert(persistAll.length === 1, 'store persists all by default');
    assert(persistFav.length === 0, 'store cache-only-favorite filters');
}

// --- PopupSearch ---

function fakeItem(text) {
    return { clipContents: text, entry: { getStringValue: () => text } };
}

{
    const search = new PopupSearch();
    const items = [fakeItem('Hello'), fakeItem('world'), fakeItem('HELLO again')];
    search.updateSettings(false, false);
    assert(search.filter(items, '').length === 3, 'search empty query returns all');
    assert(search.filter(items, 'hello').length === 2, 'search case-insensitive');
    search.updateSettings(true, false);
    assert(search.filter(items, 'hello').length === 0, 'search case-sensitive');
    assert(search.filter(items, 'Hello').length === 1, 'search case-sensitive match');
    search.updateSettings(false, true);
    assert(search.filter(items, 'h.llo').length === 2, 'search regex');
    assert(search.filter(items, '([').length === 0, 'search invalid regex falls back');
}

// --- constants ---

assert(ITEMS_PER_PAGE === 10, 'ITEMS_PER_PAGE is 10');

if (failures > 0) {
    print(`${failures} test(s) FAILED`);
    throw new Error(`${failures} test(s) failed`);
} else {
    print('All tests passed');
}
