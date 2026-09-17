import {HistoryStore} from '../../src/history/historyStore.js';
import {assert, fakeEntry} from '../testHarness.js';

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

    store.select(a, {moveFirst: true});
    assert(store.entries[2] === a, 'store moveFirst moves to end (newest)');
}

{
    // pasting a favorite moves it to the top like any other paste
    const store = new HistoryStore();
    const a = fakeEntry('a', true);
    const b = fakeEntry('b');
    const c = fakeEntry('c', true);
    store.load([a, b, c]);
    store.select(a, {moveFirst: true});
    assert(store.entries[2] === a, 'store moveFirst moves favorite to end (newest)');
}

{
    // paste echo is an equal-but-distinct object, must resolve to the live entry
    const store = new HistoryStore();
    const a = fakeEntry('a');
    store.load([a, fakeEntry('b')]);
    assert(store.findEqual(fakeEntry('a')) === a, 'store findEqual resolves echo to live entry');
    assert(store.findEqual(fakeEntry('zzz')) === null, 'store findEqual misses unknown entry');
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
    const {removed, clearedClipboard} = store.clear({keepSelected: true});
    assert(removed.length === 0, 'store clear keeps selected when asked');
    assert(clearedClipboard === false, 'store clear reports no clipboard clear');
    const res2 = store.clear({keepSelected: false});
    assert(res2.removed.length === 1 && res2.clearedClipboard === true,
        'store clear removes selected and flags clipboard');
    assert(store.entries.length === 1 && store.entries[0] === fav,
        'store clear always preserves favorites');
}

{
    const store = new HistoryStore();
    store.load([fakeEntry('x')]);
    const persistAll = store.toPersistable({cacheOnlyFavorite: false});
    const persistFav = store.toPersistable({cacheOnlyFavorite: true});
    assert(persistAll.length === 1, 'store persists all by default');
    assert(persistFav.length === 0, 'store cache-only-favorite filters');
}

{
    // pasting resolves the echo to the live entry and bubbles that one
    const store = new HistoryStore();
    const a = fakeEntry('a');
    store.load([a, fakeEntry('b')]);
    const resolved = store.select(fakeEntry('a'), {moveFirst: true});
    assert(resolved === a, 'store select resolves echo to live entry');
    assert(store.entries[1] === a, 'store select bubbles resolved entry to end (newest)');
    assert(store.selected === a, 'store select tracks resolved entry');
}

{
    const store = new HistoryStore();
    const a = fakeEntry('a');
    store.load([a]);
    assert(store.select(fakeEntry('zzz')) === null, 'store select misses unknown entry');
    assert(store.selected === a, 'store select miss keeps selection');
}

{
    const store = new HistoryStore();
    store.load([fakeEntry('a'), fakeEntry('b'), fakeEntry('c')], fakeEntry('zzz'));
    assert(store.selected.getStringValue() === 'c', 'store load falls back to last on unknown selected');
    const a = fakeEntry('a');
    store.load([a, fakeEntry('b')], a);
    assert(store.selected === a, 'store load honors explicit selected entry');
}

{
    const store = new HistoryStore();
    assert(store.has(fakeEntry('a')) === false, 'store misses entry when empty');
    const added = store.add(fakeEntry('a'));
    assert(store.length === 1 && store.has(added), 'store add registers entry');
    assert(store.has(fakeEntry('a')), 'store has matches equal-but-distinct entry');
    assert(!store.has(fakeEntry('zzz')), 'store has misses unknown entry');
}

{
    const store = new HistoryStore();
    const entry = fakeEntry('plain');
    store.load([entry]);
    assert(store.toggleFavorite(entry) === true, 'store toggleFavorite marks favorite');
    assert(entry.isFavorite(), 'store toggleFavorite flips entry');
    assert(store.toggleFavorite(entry) === false, 'store toggleFavorite clears favorite');
}

{
    const store = new HistoryStore();
    const a = fakeEntry('a');
    const b = fakeEntry('b');
    const c = fakeEntry('c');
    store.load([a, b, c]);
    assert(store.remove(a) === false, 'store remove reports unselected drop');
    assert(store.entries.length === 2, 'store remove drops entry');
    assert(store.remove(c) === true, 'store remove reports selected drop');
    assert(store.selected === b, 'store remove falls back to newest');
    assert(store.remove(fakeEntry('zzz')) === false, 'store remove misses unknown entry');
    store.remove(b);
    assert(store.selected === null, 'store remove empties selection with last entry');
}

{
    // trimming the selected entry must re-point selection at the newest kept
    const store = new HistoryStore();
    const a = fakeEntry('a');
    store.load([a, fakeEntry('b'), fakeEntry('c')]);
    store.select(a);
    const removed = store.trim(1);
    assert(removed.length === 2, 'store trim drops down to max size');
    assert(removed[0].wasSelected, 'store trim reports selected drop');
    assert(store.selected.getStringValue() === 'c', 'store trim falls back to newest');
}

{
    const store = new HistoryStore();
    store.load([fakeEntry('fav', true), fakeEntry('fav2', true)]);
    assert(store.trim(0).length === 0, 'store trim never drops favorites');
    assert(store.toPersistable().length === 2, 'store persists all with default args');
}
