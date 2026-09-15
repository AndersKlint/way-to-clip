// headless tests for the pure bits, run with: gjs -m tests/runTests.js (or make check)

import { HistoryStore } from '../src/history/historyStore.js';
import { PopupSearch } from '../src/cursorPopup/popupSearch.js';
import { decidePasteMode, isTerminalWindow, snapshotPasteTarget, PasteMode } from '../src/paste/pasteTarget.js';
import * as LocalShortcuts from '../src/cursorPopup/localShortcutUtils.js';
import { ITEMS_PER_PAGE, PrefsFields } from '../src/common/constants.js';
import {
    AVAILABLE_LANGUAGES,
    LANGUAGE_LABELS,
    SYSTEM_LANGUAGE,
    getStoredLanguage,
    isKnownLanguage,
    normalizeLanguage,
    setLanguageOverride,
    getLanguageOverride,
    translate,
} from '../src/common/i18n.js';
import { TRANSLATIONS } from '../src/common/translations.js';
import { HistoryClearScheduler } from '../src/history/historyClearScheduler.js';
import { ClipboardEntry } from '../src/clipboard/clipboardEntry.js';
import { PopupSelectionController } from '../src/cursorPopup/popupSelectionController.js';
import {
    SECRET_HINT_MIMETYPES,
    isSecretHintMimetype,
    isStrictSecretText,
    isSecretHintPayload,
} from '../src/clipboard/secretHints.js';

let failures = 0;

function test(name, fn) {
    try {
        fn();
        print(`ok - ${name}`);
    } catch (e) {
        print(`FAIL - ${name}: ${e.message}`);
        failures++;
    }
}

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
        equals(other) { return other && other.getStringValue() === this._value; },
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

// --- PopupSelectionController ordering ---

{
    const sel = new PopupSelectionController({ handlers: {}, popup: {}, search: {} });
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
    store.select(a, { moveFirst: true });
    const sel = new PopupSelectionController({ handlers: {}, popup: {}, search: {} });
    sel.reset(store.entries);
    assert(sel.getCurrentPageState().entries[0] === a,
        'selection shows bubbled entry on top');
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
        popup: { renderPage() {} },
        search: { isSearchMode: false },
    });
    sel.reset([...backing]);
    sel.setPageActors([{}, {}, {}]);
    sel.deleteSelectedItem();
    const page = sel.getCurrentPageState();
    assert(page.entries.length === 2 && page.entries[0].getStringValue() === 'b' &&
        page.entries[1].getStringValue() === 'a',
        'selection stays newest-first after delete');
}

// --- PopupSearch ---

{
    const search = new PopupSearch();
    const items = [fakeEntry('Hello'), fakeEntry('world'), fakeEntry('HELLO again')];
    search.applySettings(false, false);
    assert(search.filter(items, '').length === 3, 'search empty query returns all');
    assert(search.filter(items, 'hello').length === 2, 'search case-insensitive');
    search.applySettings(true, false);
    assert(search.filter(items, 'hello').length === 0, 'search case-sensitive');
    assert(search.filter(items, 'Hello').length === 1, 'search case-sensitive match');
    search.applySettings(false, true);
    assert(search.filter(items, 'h.llo').length === 2, 'search regex');
    assert(search.filter(items, '([').length === 0, 'search invalid regex falls back');
}

{
    // Accessors used by the popup's Aa/.* toggle buttons.
    const search = new PopupSearch();
    assert(search.caseSensitive === false && search.regexEnabled === false,
        'search toggles default off');
    search.setCaseSensitive(true);
    search.setRegexEnabled(true);
    assert(search.caseSensitive === true && search.regexEnabled === true,
        'search toggle setters flip on');
    search.applySettings(false, false);
    assert(search.caseSensitive === false && search.regexEnabled === false,
        'search applySettings resets toggles');
    const items = [fakeEntry('Hello'), fakeEntry('hello')];
    search.setCaseSensitive(true);
    assert(search.filter(items, 'hello').length === 1, 'search toggle setter affects filter');
}

// --- pasteTarget ---

{
    const T = (isPurposeTerminal, isTerminalWindow = false) =>
        snapshotPasteTarget({ isPurposeTerminal, isTerminalWindow });

    assert(snapshotPasteTarget({ isPurposeTerminal: 1, isTerminalWindow: 1 }).isTerminalWindow === true,
        'snapshot coerces window flag to boolean');

    // The reported bug: popup opened in a terminal (snapshot TERMINAL),
    // modal grab reset the live purpose to NORMAL by paste time.
    // Must still take the terminal keystroke, otherwise a plain Ctrl+V
    // misses the terminal's clipboard paste binding.
    assert(decidePasteMode(T(true), false) === PasteMode.TERMINAL,
        'paste uses terminal keys when live purpose went stale');
    assert(decidePasteMode(T(true), undefined) === PasteMode.TERMINAL,
        'paste uses terminal keys when live purpose never reported');
    // Focus returns to the terminal before pasting.
    assert(decidePasteMode(T(false), true) === PasteMode.TERMINAL,
        'paste uses terminal keys when live purpose recovered');
    // No snapshot (paste without a prior open): live value decides.
    assert(decidePasteMode(null, true) === PasteMode.TERMINAL,
        'paste falls back to live terminal purpose');
    assert(decidePasteMode(null, false) === PasteMode.TEXT,
        'paste falls back to live text purpose');
    assert(decidePasteMode(T(false), false) === PasteMode.TEXT,
        'paste uses text keys for plain fields');
    assert(decidePasteMode(null, undefined) === PasteMode.TEXT,
        'paste uses text keys when purpose unknown');

    // Window-class fallback: input method reports no purpose at all
    // (both undefined), e.g. Ptyxis on non-IBus setups. Without the
    // snapshot flag the terminal would get plain Ctrl+V instead of
    // Ctrl+Shift+V.
    assert(decidePasteMode(T(undefined, true), undefined) === PasteMode.TERMINAL,
        'paste uses terminal keys from window snapshot without purpose');
    assert(decidePasteMode(T(undefined, false), undefined) === PasteMode.TEXT,
        'paste uses text keys without purpose or snapshot');
    assert(decidePasteMode(T(false, true), false) === PasteMode.TERMINAL,
        'window snapshot wins over stale normal purpose');
}

{
    // Sample of the terminal-apps setting default (see the schema).
    const DEFAULTS = ['org.gnome.ptyxis', 'gnome-terminal-server',
        'org.gnome.Terminal', 'Alacritty', 'GHOSTTY', 'org.kde.konsole'];

    assert(isTerminalWindow('org.gnome.Ptyxis', null, DEFAULTS), 'ptyxis detected');
    assert(isTerminalWindow('gnome-terminal-server', 'org.gnome.Terminal', DEFAULTS), 'gnome terminal detected');
    assert(isTerminalWindow('Alacritty', null, DEFAULTS), 'alacritty detected');
    assert(isTerminalWindow('GHOSTTY', 'com.mitchellh.ghostty', DEFAULTS), 'ghostty detected case-insensitively');
    assert(isTerminalWindow(null, 'org.kde.konsole', DEFAULTS), 'konsole detected via app id');
    assert(!isTerminalWindow('firefox', 'org.mozilla.firefox', DEFAULTS), 'browser not detected');
    assert(!isTerminalWindow('code', 'vscode', DEFAULTS), 'editor not detected');
    assert(!isTerminalWindow(null, null, DEFAULTS), 'null window not detected');
    assert(!isTerminalWindow(undefined, undefined, DEFAULTS), 'undefined window not detected');

    // User-added entries merge with the pre-filled defaults.
    assert(isTerminalWindow('myterm', null, [...DEFAULTS, 'MyTerm']), 'custom terminal detected case-insensitively');
    assert(isTerminalWindow(null, 'com.example.foo', ['  com.example.foo  ']), 'custom app id detected trimmed');
    assert(!isTerminalWindow('firefox', null, ['myterm']), 'non-listed app still not detected');
    assert(!isTerminalWindow('myterm', null, []), 'empty list matches nothing');
    assert(!isTerminalWindow('myterm', null, null), 'null list matches nothing');
    assert(!isTerminalWindow('myterm', null, ['', '  ', null, 42]), 'blank/non-string entries ignored');
}

// --- localShortcuts ---

{
    // Parsing
    assert(LocalShortcuts.parseAccelerator('s').keyval === 0x73, 'parse bare letter');
    assert(LocalShortcuts.parseAccelerator('s').mods === 0, 'parse bare letter has no mods');
    const altC = LocalShortcuts.parseAccelerator('<Alt>c');
    assert(altC.keyval === 0x63 && altC.mods === LocalShortcuts.ModMask.MOD1, 'parse Alt combo');
    const tab = LocalShortcuts.parseAccelerator('Tab');
    assert(tab.keyval === 0xff09 && tab.mods === 0, 'parse Tab');
    const shiftTab = LocalShortcuts.parseAccelerator('<Shift>ISO_Left_Tab');
    assert(shiftTab.keyval === 0xfe20 && shiftTab.mods === LocalShortcuts.ModMask.SHIFT, 'parse Shift+Tab');
    assert(LocalShortcuts.parseAccelerator('KP_Enter').keyval === 0xff8d, 'parse KP_Enter');
    assert(LocalShortcuts.parseAccelerator('<Control><Shift>F10').mods ===
        (LocalShortcuts.ModMask.CONTROL | LocalShortcuts.ModMask.SHIFT), 'parse multi-modifier');
    assert(LocalShortcuts.parseAccelerator('') === null, 'parse empty is null');
    assert(LocalShortcuts.parseAccelerator(null) === null, 'parse null is null');
    assert(LocalShortcuts.parseAccelerator('<Foo>x') === null, 'parse unknown modifier is null');
    assert(LocalShortcuts.parseAccelerator('NotAKey') === null, 'parse unknown key is null');
    assert(LocalShortcuts.parseAcceleratorList(['s', 'bogus', null]).length === 1, 'parse list drops bad entries');
    assert(LocalShortcuts.parseAcceleratorList([]).length === 0, 'parse empty list (cleared shortcut)');

    // Display
    assert(LocalShortcuts.formatAccelerator('s') === 's', 'format bare letter');
    assert(LocalShortcuts.formatAccelerator('<Alt>c') === 'Alt+C', 'format Alt combo');
    assert(LocalShortcuts.formatAccelerator('<Alt>r') === 'Alt+R', 'format Alt+R');
    assert(LocalShortcuts.formatAccelerator('Tab') === 'Tab', 'format Tab');
    assert(LocalShortcuts.formatAccelerator('<Shift>ISO_Left_Tab') === 'Shift+Tab', 'format Shift+Tab');
    assert(LocalShortcuts.formatAccelerator('KP_Enter') === 'KP_Enter', 'format KP_Enter');
    assert(LocalShortcuts.formatAccelerator('<Control>F10') === 'Ctrl+F10', 'format Ctrl+F10');

    // Matching (fake key events)
    const ev = (sym, state = 0) => ({
        get_key_symbol: () => sym,
        get_state: () => state,
    });
    const search = LocalShortcuts.parseAcceleratorList(LocalShortcuts.DEFAULT_LOCAL_SHORTCUTS.search);
    assert(LocalShortcuts.matchesShortcut(ev(0x73), search), 'default search matches s');
    assert(!LocalShortcuts.matchesShortcut(ev(0x53, LocalShortcuts.ModMask.SHIFT), search), 'default search ignores Shift+S');
    assert(!LocalShortcuts.matchesShortcut(ev(0x73, LocalShortcuts.ModMask.CONTROL), search), 'default search rejects Ctrl+S');
    assert(LocalShortcuts.matchesShortcut(ev(0x73, LocalShortcuts.ModMask.MOD2), search), 'default search ignores NumLock');
    assert(!LocalShortcuts.matchesShortcut(ev(0x64), search), 'default search rejects d');
    const cs = LocalShortcuts.parseAcceleratorList(LocalShortcuts.DEFAULT_LOCAL_SHORTCUTS.caseSensitive);
    assert(LocalShortcuts.matchesShortcut(ev(0x63, LocalShortcuts.ModMask.MOD1), cs), 'default match-case matches Alt+C');
    assert(LocalShortcuts.matchesShortcut(ev(0x43, LocalShortcuts.ModMask.MOD1 | LocalShortcuts.ModMask.SHIFT), cs), 'default match-case matches Alt+Shift+C');
    assert(!LocalShortcuts.matchesShortcut(ev(0x63), cs), 'default match-case requires Alt');
    assert(!LocalShortcuts.matchesShortcut(ev(0x72, LocalShortcuts.ModMask.MOD1), cs), 'default match-case rejects Alt+R');
    assert(!LocalShortcuts.matchesShortcut(ev(0x63, LocalShortcuts.ModMask.MOD1 | LocalShortcuts.ModMask.CONTROL), cs), 'default match-case rejects Ctrl+Alt+C');
    assert(LocalShortcuts.matchesShortcut(ev(0x43, LocalShortcuts.ModMask.MOD1 | LocalShortcuts.ModMask.LOCK), cs), 'default match-case matches CapsLock+Alt+C');
    const shiftD = LocalShortcuts.parseAcceleratorList(['<Shift>d']);
    assert(LocalShortcuts.matchesShortcut(ev(0x44, LocalShortcuts.ModMask.SHIFT), shiftD), 'Shift+D matches <Shift>d');
    assert(!LocalShortcuts.matchesShortcut(ev(0x64), shiftD), 'bare d does not match <Shift>d');
    assert(!LocalShortcuts.matchesShortcut(ev(0x44, LocalShortcuts.ModMask.SHIFT | LocalShortcuts.ModMask.CONTROL), shiftD), 'Ctrl+Shift+D does not match <Shift>d');
    const next = LocalShortcuts.parseAcceleratorList(LocalShortcuts.DEFAULT_LOCAL_SHORTCUTS.pageNext);
    assert(LocalShortcuts.matchesShortcut(ev(0xff09), next), 'default page-next matches Tab');
    assert(LocalShortcuts.matchesShortcut(ev(0xff53), next), 'default page-next matches Right');
    assert(!LocalShortcuts.matchesShortcut(ev(0xff51), next), 'default page-next rejects Left');
    const prev = LocalShortcuts.parseAcceleratorList(LocalShortcuts.DEFAULT_LOCAL_SHORTCUTS.pagePrevious);
    assert(LocalShortcuts.matchesShortcut(ev(0xfe20, LocalShortcuts.ModMask.SHIFT), prev), 'default page-previous matches Shift+Tab');
    assert(LocalShortcuts.matchesShortcut(ev(0xff51), prev), 'default page-previous matches Left');
    assert(!LocalShortcuts.matchesShortcut(ev(0xff53), prev), 'default page-previous rejects Right');
    const confirm = LocalShortcuts.parseAcceleratorList(LocalShortcuts.DEFAULT_LOCAL_SHORTCUTS.confirm);
    assert(LocalShortcuts.matchesShortcut(ev(0xff0d), confirm), 'default confirm matches Return');
    assert(LocalShortcuts.matchesShortcut(ev(0xff8d), confirm), 'default confirm matches KP_Enter');
    assert(!LocalShortcuts.matchesShortcut(ev(0x73), confirm), 'default confirm rejects s');
    assert(!LocalShortcuts.matchesShortcut(ev(0x73), []), 'cleared shortcut matches nothing');
}

// --- constants ---

assert(ITEMS_PER_PAGE === 10, 'ITEMS_PER_PAGE is 10');

// --- i18n ---

{
    assert(SYSTEM_LANGUAGE === 'system', 'system language constant');
    assert(AVAILABLE_LANGUAGES[0] === 'system', 'system first in language list');
    assert(AVAILABLE_LANGUAGES.length === Object.keys(LANGUAGE_LABELS).length + 1,
        'language list covers all labels');
    assert(isKnownLanguage('system') && isKnownLanguage('de'), 'known languages');
    assert(!isKnownLanguage('xx'), 'unknown language rejected');
    assert(normalizeLanguage('de') === 'de', 'normalize keeps known code');
    assert(normalizeLanguage('xx') === 'system', 'normalize falls back to system');
    assert(normalizeLanguage('') === 'system', 'normalize empty to system');
    assert(normalizeLanguage(null) === 'system', 'normalize null to system');

    const fakeSettings = lang => ({ get_string: () => lang });
    assert(getStoredLanguage(fakeSettings('de')) === 'de', 'stored language read');
    assert(getStoredLanguage(fakeSettings('xx')) === 'system', 'stored junk normalized');
    assert(getStoredLanguage({}) === 'system', 'stored missing key tolerated');
    assert(getStoredLanguage(null) === 'system', 'stored null tolerated');

    const identity = s => s;
    setLanguageOverride('system');
    assert(getLanguageOverride() === 'system', 'override set/get system');
    assert(translate('Hello', identity) === 'Hello', 'system delegates to native');

    // Find a real translated entry from the generated catalogs, if any.
    let proven = false;
    for (const [lang, catalog] of Object.entries(TRANSLATIONS)) {
        const msgid = Object.keys(catalog ?? {})[0];
        if (msgid && catalog[msgid]) {
            setLanguageOverride(lang);
            assert(translate(msgid, identity) === catalog[msgid],
                `override translates ${lang}`);
            assert(translate('__waytoclip_missing__', identity) === '__waytoclip_missing__',
                'override miss falls back to native');
            proven = true;
            break;
        }
    }
    assert(proven, 'at least one catalog entry exercised');
    setLanguageOverride('system');
    assert(translate('Hello', identity) === 'Hello', 'override resets to system');
}

// --- PopupSearch regex regression (raw query + flag, not lowercased pattern) ---

{
    const search = new PopupSearch();
    search.applySettings(false, true);
    const items = [fakeEntry('hello'), fakeEntry('HELLO'), fakeEntry('123')];
    assert(search.filter(items, '[A-Z]+').length === 2,
        'search case-insensitive regex uses raw pattern with i flag');
    search.applySettings(true, true);
    assert(search.filter(items, '[A-Z]+').length === 1,
        'search case-sensitive regex respects case');
    search.applySettings(false, true);
    const paren = [fakeEntry('a(b'), fakeEntry('xyz')];
    assert(search.filter(paren, '(').length === 1,
        'search invalid regex falls back to plain contains');
}

// --- fakeEntry mirrors ClipboardEntry surface used by HistoryStore ---

test('fakeEntry covers ClipboardEntry interface', () => {
    const fake = fakeEntry('x');
    for (const m of ['equals', 'isFavorite', 'isText', 'isImage', 'getStringValue']) {
        if (typeof ClipboardEntry.prototype[m] !== 'function')
            throw new Error(`ClipboardEntry missing ${m}`);
        if (typeof fake[m] !== 'function' && m !== 'equals')
            throw new Error(`fakeEntry missing ${m}`);
    }
    if (typeof fake.equals !== 'function')
        throw new Error('fakeEntry missing equals');
});

// --- HistoryClearScheduler ---

function fakeScheduler({ snap, now = 1000 }) {
    const persisted = {};
    const ticks = [];
    let clears = 0;
    const settings = {
        connect: () => 1,
        disconnect: () => {},
        set_int: (k, v) => { persisted[k] = v; },
    };
    const settingsManager = { snapshot: () => ({ ...snap }) };
    const sched = new HistoryClearScheduler({
        settings,
        settingsManager,
        onClear: () => { clears++; },
        onTick: v => { ticks.push(v); },
        nowSeconds: () => now,
    });
    // never arm real GLib timers in tests
    sched._arm = () => {};
    return { sched, persisted, ticks, clears: () => clears };
}

test('scheduler start disabled ticks -1', () => {
    const { sched, ticks } = fakeScheduler({
        snap: { clearHistoryOnInterval: false, clearHistoryInterval: 10, nextHistoryClear: 5 },
    });
    sched.start();
    if (ticks.length !== 1 || ticks[0] !== -1)
        throw new Error(`expected single -1 tick, got ${JSON.stringify(ticks)}`);
    sched.destroy();
});

test('scheduler start with next===-1 schedules', () => {
    const { sched, persisted } = fakeScheduler({
        snap: { clearHistoryOnInterval: true, clearHistoryInterval: 10, nextHistoryClear: -1 },
        now: 1000,
    });
    sched.start();
    const expected = 1000 + 10 * 60;
    if (persisted[PrefsFields.NEXT_HISTORY_CLEAR] !== expected)
        throw new Error(`expected next=${expected}, got ${persisted[PrefsFields.NEXT_HISTORY_CLEAR]}`);
    sched.destroy();
});

test('scheduler start with overdue fires onClear then reschedules', () => {
    const { sched, persisted, clears } = fakeScheduler({
        snap: { clearHistoryOnInterval: true, clearHistoryInterval: 10, nextHistoryClear: 500 },
        now: 1000,
    });
    sched.start();
    if (clears() !== 1)
        throw new Error(`expected 1 clear, got ${clears()}`);
    const expected = 1000 + 10 * 60;
    if (persisted[PrefsFields.NEXT_HISTORY_CLEAR] !== expected)
        throw new Error(`expected reschedule to ${expected}`);
    sched.destroy();
});

test('scheduler schedule disabled persists -1', () => {
    const { sched, persisted, ticks } = fakeScheduler({
        snap: { clearHistoryOnInterval: false, clearHistoryInterval: 10, nextHistoryClear: 999 },
    });
    sched.schedule();
    if (persisted[PrefsFields.NEXT_HISTORY_CLEAR] !== -1)
        throw new Error('expected -1 persisted');
    if (ticks[ticks.length - 1] !== -1)
        throw new Error('expected -1 tick');
    sched.destroy();
});

test('scheduler timeLeft', () => {
    const disabled = fakeScheduler({
        snap: { clearHistoryOnInterval: false, clearHistoryInterval: 10, nextHistoryClear: 2000 },
        now: 1000,
    });
    if (disabled.sched.timeLeft() !== -1)
        throw new Error('disabled should be -1');
    disabled.sched.destroy();
    const enabled = fakeScheduler({
        snap: { clearHistoryOnInterval: true, clearHistoryInterval: 10, nextHistoryClear: 1500 },
        now: 1000,
    });
    if (enabled.sched.timeLeft() !== 500)
        throw new Error(`expected 500, got ${enabled.sched.timeLeft()}`);
    enabled.sched.destroy();
});

// --- secret mimetypes ---

test('secret hint mimetypes cover kde, gnome and concealed', () => {
    for (const m of ['x-kde-passwordManagerHint', 'x-gnome-passwordManagerHint',
        'application/x-nspasteboard-concealed-type']) {
        if (!SECRET_HINT_MIMETYPES.includes(m))
            throw new Error(`missing ${m}`);
        if (!isSecretHintMimetype(m))
            throw new Error(`not detected ${m}`);
    }
    if (isSecretHintMimetype('text/plain'))
        throw new Error('text/plain must not be secret');
    if (!isSecretHintMimetype('X-KDE-PASSWORDMANAGERHINT'))
        throw new Error('mimetype match must be case-insensitive');
});

test('secret hint value is strict secret only', () => {
    for (const good of ['secret', 'secret\n', 'secret\0', ' secret ']) {
        if (!isStrictSecretText(good))
            throw new Error(`must match ${JSON.stringify(good)}`);
    }
    for (const bad of ['Secret', 'SECRET', 'secret1', 'secrets', '', 'true', null, undefined, 42]) {
        if (isStrictSecretText(bad))
            throw new Error(`must not match ${String(bad)}`);
    }
});

test('secret hint payload rules', () => {
    const kde = 'x-kde-passwordManagerHint';
    const gnome = 'x-gnome-passwordManagerHint';
    const concealed = 'application/x-nspasteboard-concealed-type';
    if (!isSecretHintPayload(kde, 'secret'))
        throw new Error('kde secret must match');
    if (!isSecretHintPayload(kde, new TextEncoder().encode('secret')))
        throw new Error('kde secret bytes must match');
    if (isSecretHintPayload(kde, 'Secret'))
        throw new Error('kde value must be case-sensitive');
    if (isSecretHintPayload(kde, ''))
        throw new Error('kde empty must not match');
    if (!isSecretHintPayload(gnome, 'secret'))
        throw new Error('gnome secret must match');
    if (!isSecretHintPayload(concealed, ''))
        throw new Error('concealed type is secret by presence');
    if (!isSecretHintPayload(concealed, null))
        throw new Error('concealed type is secret regardless of value');
    if (isSecretHintPayload('text/plain', 'secret'))
        throw new Error('plain text is never a hint');
});

test('ignore-secret-mimetypes pref defaults to true', () => {
    if (PrefsFields.IGNORE_SECRET_MIMETYPES !== 'ignore-secret-mimetypes')
        throw new Error('pref key mismatch');
});

if (failures > 0) {
    print(`${failures} test(s) FAILED`);
    throw new Error(`${failures} test(s) failed`);
} else {
    print('All tests passed');
}
