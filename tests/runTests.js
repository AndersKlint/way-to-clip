/**
 * Headless unit tests for pure-logic modules.
 * Run: gjs -m tests/runTests.js   (or: make check)
 */

import { HistoryStore } from '../src/historyStore.js';
import { PopupSearch } from '../cursor-popup/popupSearch.js';
import { decidePasteMode, isTerminalWindow, snapshotPasteTarget, PasteMode } from '../src/pasteKeys.js';
import {
    DEFAULT_LOCAL_SHORTCUTS,
    formatAccelerator,
    matchesShortcut,
    ModMask,
    parseAccelerator,
    parseAcceleratorList,
} from '../cursor-popup/localShortcuts.js';
import { ITEMS_PER_PAGE } from '../constants.js';
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
} from '../src/i18n.js';
import { TRANSLATIONS } from '../src/translations.js';

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

{
    // Accessors used by the popup's Aa/.* toggle buttons.
    const search = new PopupSearch();
    assert(search.caseSensitive === false && search.regexEnabled === false,
        'search toggles default off');
    search.setCaseSensitive(true);
    search.setRegexEnabled(true);
    assert(search.caseSensitive === true && search.regexEnabled === true,
        'search toggle setters flip on');
    search.updateSettings(false, false);
    assert(search.caseSensitive === false && search.regexEnabled === false,
        'search updateSettings resets toggles');
    const items = [fakeItem('Hello'), fakeItem('hello')];
    search.setCaseSensitive(true);
    assert(search.filter(items, 'hello').length === 1, 'search toggle setter affects filter');
}

// --- pasteKeys ---

{
    // Stand-ins for Clutter.InputContentPurpose values.
    const TERMINAL = 9;
    const NORMAL = 0;
    const T = (purpose, windowIsTerminal = false) =>
        snapshotPasteTarget(purpose, windowIsTerminal);

    assert(snapshotPasteTarget(TERMINAL, 1).windowIsTerminal === true,
        'snapshot coerces window flag to boolean');

    // The reported bug: popup opened in a terminal (snapshot TERMINAL),
    // modal grab reset the live purpose to NORMAL by paste time.
    // Must still take the terminal keystroke, otherwise a plain Ctrl+V
    // misses the terminal's clipboard paste binding.
    assert(decidePasteMode(T(TERMINAL), NORMAL, TERMINAL) === PasteMode.TERMINAL,
        'paste uses terminal keys when live purpose went stale');
    assert(decidePasteMode(T(TERMINAL), undefined, TERMINAL) === PasteMode.TERMINAL,
        'paste uses terminal keys when live purpose never reported');
    // Focus returns to the terminal before pasting.
    assert(decidePasteMode(T(NORMAL), TERMINAL, TERMINAL) === PasteMode.TERMINAL,
        'paste uses terminal keys when live purpose recovered');
    // No snapshot (paste without a prior open): live value decides.
    assert(decidePasteMode(null, TERMINAL, TERMINAL) === PasteMode.TERMINAL,
        'paste falls back to live terminal purpose');
    assert(decidePasteMode(null, NORMAL, TERMINAL) === PasteMode.TEXT,
        'paste falls back to live text purpose');
    assert(decidePasteMode(T(NORMAL), NORMAL, TERMINAL) === PasteMode.TEXT,
        'paste uses text keys for plain fields');
    assert(decidePasteMode(null, undefined, TERMINAL) === PasteMode.TEXT,
        'paste uses text keys when purpose unknown');

    // Window-class fallback: input method reports no purpose at all
    // (both undefined), e.g. Ptyxis on non-IBus setups. Without the
    // snapshot flag the terminal would get plain Ctrl+V instead of
    // Ctrl+Shift+V.
    assert(decidePasteMode(T(undefined, true), undefined, TERMINAL) === PasteMode.TERMINAL,
        'paste uses terminal keys from window snapshot without purpose');
    assert(decidePasteMode(T(undefined, false), undefined, TERMINAL) === PasteMode.TEXT,
        'paste uses text keys without purpose or snapshot');
    assert(decidePasteMode(T(NORMAL, true), NORMAL, TERMINAL) === PasteMode.TERMINAL,
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
    assert(parseAccelerator('s').keyval === 0x73, 'parse bare letter');
    assert(parseAccelerator('s').mods === 0, 'parse bare letter has no mods');
    const altC = parseAccelerator('<Alt>c');
    assert(altC.keyval === 0x63 && altC.mods === ModMask.MOD1, 'parse Alt combo');
    const tab = parseAccelerator('Tab');
    assert(tab.keyval === 0xff09 && tab.mods === 0, 'parse Tab');
    const shiftTab = parseAccelerator('<Shift>ISO_Left_Tab');
    assert(shiftTab.keyval === 0xfe20 && shiftTab.mods === ModMask.SHIFT, 'parse Shift+Tab');
    assert(parseAccelerator('KP_Enter').keyval === 0xff8d, 'parse KP_Enter');
    assert(parseAccelerator('<Control><Shift>F10').mods ===
        (ModMask.CONTROL | ModMask.SHIFT), 'parse multi-modifier');
    assert(parseAccelerator('') === null, 'parse empty is null');
    assert(parseAccelerator(null) === null, 'parse null is null');
    assert(parseAccelerator('<Foo>x') === null, 'parse unknown modifier is null');
    assert(parseAccelerator('NotAKey') === null, 'parse unknown key is null');
    assert(parseAcceleratorList(['s', 'bogus', null]).length === 1, 'parse list drops bad entries');
    assert(parseAcceleratorList([]).length === 0, 'parse empty list (cleared shortcut)');

    // Display
    assert(formatAccelerator('s') === 's', 'format bare letter');
    assert(formatAccelerator('<Alt>c') === 'Alt+C', 'format Alt combo');
    assert(formatAccelerator('<Alt>r') === 'Alt+R', 'format Alt+R');
    assert(formatAccelerator('Tab') === 'Tab', 'format Tab');
    assert(formatAccelerator('<Shift>ISO_Left_Tab') === 'Shift+Tab', 'format Shift+Tab');
    assert(formatAccelerator('KP_Enter') === 'KP_Enter', 'format KP_Enter');
    assert(formatAccelerator('<Control>F10') === 'Ctrl+F10', 'format Ctrl+F10');

    // Matching (fake key events)
    const ev = (sym, state = 0) => ({
        get_key_symbol: () => sym,
        get_state: () => state,
    });
    const search = parseAcceleratorList(DEFAULT_LOCAL_SHORTCUTS.search);
    assert(matchesShortcut(ev(0x73), search), 'default search matches s');
    assert(!matchesShortcut(ev(0x53, ModMask.SHIFT), search), 'default search ignores Shift+S');
    assert(matchesShortcut(ev(0x73, ModMask.CONTROL), search), 'default search tolerates extra mods');
    assert(!matchesShortcut(ev(0x64), search), 'default search rejects d');
    const cs = parseAcceleratorList(DEFAULT_LOCAL_SHORTCUTS.caseSensitive);
    assert(matchesShortcut(ev(0x63, ModMask.MOD1), cs), 'default match-case matches Alt+C');
    assert(matchesShortcut(ev(0x43, ModMask.MOD1 | ModMask.SHIFT), cs), 'default match-case matches Alt+Shift+C');
    assert(!matchesShortcut(ev(0x63), cs), 'default match-case requires Alt');
    assert(!matchesShortcut(ev(0x72, ModMask.MOD1), cs), 'default match-case rejects Alt+R');
    const next = parseAcceleratorList(DEFAULT_LOCAL_SHORTCUTS.pageNext);
    assert(matchesShortcut(ev(0xff09), next), 'default page-next matches Tab');
    assert(matchesShortcut(ev(0xff53), next), 'default page-next matches Right');
    assert(!matchesShortcut(ev(0xff51), next), 'default page-next rejects Left');
    const prev = parseAcceleratorList(DEFAULT_LOCAL_SHORTCUTS.pagePrevious);
    assert(matchesShortcut(ev(0xfe20, ModMask.SHIFT), prev), 'default page-previous matches Shift+Tab');
    assert(matchesShortcut(ev(0xff51), prev), 'default page-previous matches Left');
    assert(!matchesShortcut(ev(0xff53), prev), 'default page-previous rejects Right');
    const confirm = parseAcceleratorList(DEFAULT_LOCAL_SHORTCUTS.confirm);
    assert(matchesShortcut(ev(0xff0d), confirm), 'default confirm matches Return');
    assert(matchesShortcut(ev(0xff8d), confirm), 'default confirm matches KP_Enter');
    assert(!matchesShortcut(ev(0x73), confirm), 'default confirm rejects s');
    assert(!matchesShortcut(ev(0x73), []), 'cleared shortcut matches nothing');
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

if (failures > 0) {
    print(`${failures} test(s) FAILED`);
    throw new Error(`${failures} test(s) failed`);
} else {
    print('All tests passed');
}
