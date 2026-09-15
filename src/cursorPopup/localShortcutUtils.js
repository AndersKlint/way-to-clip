/*
    Local shortcuts live inside the popup only, e.g. 'd' for delete.
    Gtk Gdk and Adw are banned in shell so this stays import free
    and works in shell prefs and gjs tests.
*/
import { PrefsFields } from '../common/constants.js';

// modifier bits copied from the platform (GDK/Clutter ModifierType): Alt is bit 3, Super is bit 6, rest as listed.
// event.get_state() reports these same bits, so matching below is plain bit masking. Keep the values in sync.
export const ModMask = {
    SHIFT: 1 << 0,
    LOCK: 1 << 1,
    CONTROL: 1 << 2,
    MOD1: 1 << 3, // Alt
    MOD2: 1 << 4,
    MOD3: 1 << 5,
    MOD4: 1 << 6, // Super
    MOD5: 1 << 7,
};

// our parser only ever produces these four, so they are the only ones that count.
// NumLock, CapsLock-state and the like get stripped before comparing and can never block a shortcut.
const SignificantMods = ModMask.CONTROL | ModMask.SHIFT | ModMask.MOD1 | ModMask.MOD4;

export const LocalActions = {
    SEARCH: 'search',
    DELETE_ENTRY: 'deleteEntry',
    PRIVATE_MODE: 'privateMode',
    TOGGLE_FAVORITE: 'toggleFavorite',
    FAVORITES_VIEW: 'favoritesView',
    PAGE_NEXT: 'pageNext',
    PAGE_PREVIOUS: 'pagePrevious',
    MOVE_UP: 'moveUp',
    MOVE_DOWN: 'moveDown',
    CONFIRM: 'confirm',
    CLOSE: 'close',
    CASE_SENSITIVE: 'caseSensitive',
    REGEX: 'regex',
    QUICK_SELECT_1: 'quickSelect1',
    QUICK_SELECT_2: 'quickSelect2',
    QUICK_SELECT_3: 'quickSelect3',
    QUICK_SELECT_4: 'quickSelect4',
    QUICK_SELECT_5: 'quickSelect5',
    QUICK_SELECT_6: 'quickSelect6',
    QUICK_SELECT_7: 'quickSelect7',
    QUICK_SELECT_8: 'quickSelect8',
    QUICK_SELECT_9: 'quickSelect9',
    QUICK_SELECT_10: 'quickSelect10',
};

// slot order matches the popup rows: slot 0 is the first row, slot 9 the tenth
export const QUICK_SELECT_ORDER = [
    'quickSelect1',
    'quickSelect2',
    'quickSelect3',
    'quickSelect4',
    'quickSelect5',
    'quickSelect6',
    'quickSelect7',
    'quickSelect8',
    'quickSelect9',
    'quickSelect10',
];

export const DEFAULT_LOCAL_SHORTCUTS = {
    [LocalActions.SEARCH]: ['s'],
    [LocalActions.DELETE_ENTRY]: ['d'],
    [LocalActions.PRIVATE_MODE]: ['p'],
    [LocalActions.TOGGLE_FAVORITE]: ['f'],
    [LocalActions.FAVORITES_VIEW]: ['-'],
    [LocalActions.PAGE_NEXT]: ['Tab', 'Right'],
    [LocalActions.PAGE_PREVIOUS]: ['<Shift>ISO_Left_Tab', 'Left'], 
    [LocalActions.MOVE_UP]: ['Up'],
    [LocalActions.MOVE_DOWN]: ['Down'],
    [LocalActions.CONFIRM]: ['Return', 'KP_Enter'],
    [LocalActions.CLOSE]: ['Escape'],
    [LocalActions.CASE_SENSITIVE]: ['<Alt>c'],
    [LocalActions.REGEX]: ['<Alt>r'],
    [LocalActions.QUICK_SELECT_1]: ['1'],
    [LocalActions.QUICK_SELECT_2]: ['2'],
    [LocalActions.QUICK_SELECT_3]: ['3'],
    [LocalActions.QUICK_SELECT_4]: ['4'],
    [LocalActions.QUICK_SELECT_5]: ['5'],
    [LocalActions.QUICK_SELECT_6]: ['6'],
    [LocalActions.QUICK_SELECT_7]: ['7'],
    [LocalActions.QUICK_SELECT_8]: ['8'],
    [LocalActions.QUICK_SELECT_9]: ['9'],
    [LocalActions.QUICK_SELECT_10]: ['0'],
};

// Preferences override default shortcuts.
export const LOCAL_SHORTCUT_PREF_KEYS = {
    [LocalActions.SEARCH]: PrefsFields.LOCAL_SEARCH,
    [LocalActions.DELETE_ENTRY]: PrefsFields.LOCAL_DELETE_ENTRY,
    [LocalActions.PRIVATE_MODE]: PrefsFields.LOCAL_PRIVATE_MODE,
    [LocalActions.TOGGLE_FAVORITE]: PrefsFields.LOCAL_TOGGLE_FAVORITE,
    [LocalActions.FAVORITES_VIEW]: PrefsFields.LOCAL_FAVORITES_VIEW,
    [LocalActions.PAGE_NEXT]: PrefsFields.LOCAL_PAGE_NEXT,
    [LocalActions.PAGE_PREVIOUS]: PrefsFields.LOCAL_PAGE_PREVIOUS,
    [LocalActions.MOVE_UP]: PrefsFields.LOCAL_MOVE_UP,
    [LocalActions.MOVE_DOWN]: PrefsFields.LOCAL_MOVE_DOWN,
    [LocalActions.CONFIRM]: PrefsFields.LOCAL_CONFIRM,
    [LocalActions.CLOSE]: PrefsFields.LOCAL_CLOSE,
    [LocalActions.CASE_SENSITIVE]: PrefsFields.LOCAL_CASE_SENSITIVE,
    [LocalActions.REGEX]: PrefsFields.LOCAL_REGEX_SEARCH,
    [LocalActions.QUICK_SELECT_1]: PrefsFields.LOCAL_QUICK_SELECT_1,
    [LocalActions.QUICK_SELECT_2]: PrefsFields.LOCAL_QUICK_SELECT_2,
    [LocalActions.QUICK_SELECT_3]: PrefsFields.LOCAL_QUICK_SELECT_3,
    [LocalActions.QUICK_SELECT_4]: PrefsFields.LOCAL_QUICK_SELECT_4,
    [LocalActions.QUICK_SELECT_5]: PrefsFields.LOCAL_QUICK_SELECT_5,
    [LocalActions.QUICK_SELECT_6]: PrefsFields.LOCAL_QUICK_SELECT_6,
    [LocalActions.QUICK_SELECT_7]: PrefsFields.LOCAL_QUICK_SELECT_7,
    [LocalActions.QUICK_SELECT_8]: PrefsFields.LOCAL_QUICK_SELECT_8,
    [LocalActions.QUICK_SELECT_9]: PrefsFields.LOCAL_QUICK_SELECT_9,
    [LocalActions.QUICK_SELECT_10]: PrefsFields.LOCAL_QUICK_SELECT_10,
};

// multi-char key names to XKB keysym values (keysymdef.h: the 0xff00 block holds special keys, arrows, F-keys).
// single letters skip this table, their keyval is just the unicode codepoint.
const NAMED_KEYS = {
    tab: [0xff09, 'Tab'],
    iso_left_tab: [0xfe20, 'Tab'],
    return: [0xff0d, 'Return'],
    kp_enter: [0xff8d, 'KP_Enter'],
    escape: [0xff1b, 'Escape'],
    backspace: [0xff08, 'BackSpace'],
    delete: [0xffff, 'Delete'],
    space: [0x20, 'Space'],
    left: [0xff51, 'Left'],
    up: [0xff52, 'Up'],
    right: [0xff53, 'Right'],
    down: [0xff54, 'Down'],
    page_up: [0xff55, 'Page_Up'],
    page_down: [0xff56, 'Page_Down'],
    home: [0xff50, 'Home'],
    end: [0xff57, 'End'],
};
// F1..F12 keysyms run consecutive from 0xffbe, so index math covers the whole row
for (let i = 1; i <= 12; i++)
    NAMED_KEYS[`f${i}`] = [0xffbd + i, `F${i}`];

// an accelerator is a GTK shortcut string: optional <Modifier> tags plus a key, like '<Alt>c' or 'Tab'.
// prefs writes these, this turns one back into { keyval, mods }. null means junk: the caller drops it,
// so a cleared or hand-edited setting matches nothing instead of crashing.
export function parseAccelerator(accel) {
    if (!accel || typeof accel !== 'string')
        return null;
    let mods = 0;
    let rest = accel;
    let m;
    const tagPattern = /^<([^>]+)>/;
    while ((m = rest.match(tagPattern))) {
        const tag = m[1].toLowerCase();
        if (tag === 'control' || tag === 'ctrl' || tag === 'primary')
            mods |= ModMask.CONTROL;
        else if (tag === 'alt')
            mods |= ModMask.MOD1;
        else if (tag === 'shift')
            mods |= ModMask.SHIFT;
        else if (tag === 'super' || tag === 'meta' || tag === 'mod4')
            mods |= ModMask.MOD4;
        else
            return null;
        rest = rest.slice(m[0].length);
    }
    if (!rest)
        return null;
    let keyval = null;
    let display = null;
    if (rest.length === 1) {
        keyval = rest.codePointAt(0);
    } else {
        const named = NAMED_KEYS[rest.toLowerCase()];
        if (!named)
            return null;
        [keyval, display] = named;
    }
    return { keyval, mods, display };
}

// one action can hold several bindings ('Tab' and 'Right' both turn the page). junk entries are dropped.
export function parseAcceleratorList(list) {
    if (!Array.isArray(list))
        return [];
    const out = [];
    for (const accel of list) {
        const parsed = parseAccelerator(accel);
        if (parsed)
            out.push({ keyval: parsed.keyval, mods: parsed.mods });
    }
    return out;
}

// ascii upper/lowercase differ in exactly one bit (0x20), so OR-ing with it folds case for comparison
function isAsciiLetter(keyval) {
    return (keyval >= 0x41 && keyval <= 0x5a) ||
        (keyval >= 0x61 && keyval <= 0x7a);
}

// matching is strict about modifiers but forgiving about letter case. capital and
// small letters count as the same key, so '<Alt>c' also fires on Alt+Shift+C and
// '<Shift>d' fires on Shift+D. any other extra modifier blocks: Ctrl+Alt+C is not
// Alt+C. one exception: a bare letter like 's' only fires on a plain s press,
// so Shift+S does nothing and stays free for typing capitals.
export function matchesBinding(event, binding) {
    if (!binding)
        return false;
    const sym = event.get_key_symbol();
    const folded = sym !== binding.keyval && isAsciiLetter(sym) &&
        isAsciiLetter(binding.keyval) && (sym | 0x20) === (binding.keyval | 0x20);
    if (sym !== binding.keyval && !folded)
        return false;
    // bare letter like 's' never matches a shifted keysym, so Shift+S types instead of firing
    if (folded && (binding.mods & ~ModMask.SHIFT) === 0 && !(binding.mods & ModMask.SHIFT))
        return false;
    const state = event.get_state() & SignificantMods;
    if (state === binding.mods)
        return true;
    // Shift only produced the capital (Alt+Shift+C for '<Alt>c'), anything else extra blocks
    return folded && !(binding.mods & ModMask.SHIFT) &&
        state === (binding.mods | ModMask.SHIFT);
}

// an action matches if any of its bindings match ('Tab' or 'Right' both turn the page)
export function matchesShortcut(event, bindings) {
    if (!Array.isArray(bindings))
        return false;
    return bindings.some(b => matchesBinding(event, b));
}

// pretty label for the footer hints: '<Alt>c' becomes 'Alt+C', '<Shift>ISO_Left_Tab' becomes 'Shift+Tab'
export function formatAccelerator(accel) {
    const parsed = parseAccelerator(accel);
    if (!parsed)
        return accel;
    const parts = [];
    if (parsed.mods & ModMask.CONTROL)
        parts.push('Ctrl');
    if (parsed.mods & ModMask.MOD1)
        parts.push('Alt');
    if (parsed.mods & ModMask.SHIFT)
        parts.push('Shift');
    if (parsed.mods & ModMask.MOD4)
        parts.push('Super');
    if (parsed.mods & ModMask.MOD2)
        parts.push('Mod2');
    if (parsed.mods & ModMask.MOD3)
        parts.push('Mod3');
    if (parsed.mods & ModMask.MOD5)
        parts.push('Mod5');
    let key;
    if (parsed.display) {
        key = parsed.display;
    } else {
        key = String.fromCodePoint(parsed.keyval);
        if (parsed.mods !== 0)
            key = key.toUpperCase();
    }
    parts.push(key);
    return parts.join('+');
}
