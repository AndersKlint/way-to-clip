import * as LocalShortcuts from '../../src/cursorPopup/localShortcutUtils.js';
import {assert, test} from '../testHarness.js';

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

test('quick select defaults cover 1-9 and 0', () => {
    const expected = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    if (LocalShortcuts.QUICK_SELECT_ORDER.length !== 10)
        throw new Error('quick select needs 10 slots');
    for (const [i, action] of LocalShortcuts.QUICK_SELECT_ORDER.entries()) {
        const def = LocalShortcuts.DEFAULT_LOCAL_SHORTCUTS[action];
        if (!def || def[0] !== expected[i])
            throw new Error(`${action} defaults to ${expected[i]}`);
        const parsed = LocalShortcuts.parseAcceleratorList(def);
        if (parsed.length !== 1)
            throw new Error(`${action} must parse to one binding`);
    }
    const ev = (sym, state = 0) => ({
        get_key_symbol: () => sym,
        get_state: () => state,
    });
    for (const [i, action] of LocalShortcuts.QUICK_SELECT_ORDER.entries()) {
        const bindings = LocalShortcuts.parseAcceleratorList(
            LocalShortcuts.DEFAULT_LOCAL_SHORTCUTS[action]);
        const sym = expected[i].codePointAt(0);
        if (!LocalShortcuts.matchesShortcut(ev(sym), bindings))
            throw new Error(`${action} must match ${expected[i]}`);
    }
});
