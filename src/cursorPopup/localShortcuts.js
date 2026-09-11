// no gi imports on purpose so tests can run headless

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

export const LocalActions = {
    SEARCH: 'search',
    DELETE_ENTRY: 'deleteEntry',
    PRIVATE_MODE: 'privateMode',
    PAGE_NEXT: 'pageNext',
    PAGE_PREVIOUS: 'pagePrevious',
    MOVE_UP: 'moveUp',
    MOVE_DOWN: 'moveDown',
    CONFIRM: 'confirm',
    CLOSE: 'close',
    CASE_SENSITIVE: 'caseSensitive',
    REGEX: 'regex',
};

export const DEFAULT_LOCAL_SHORTCUTS = {
    [LocalActions.SEARCH]: ['s'],
    [LocalActions.DELETE_ENTRY]: ['d'],
    [LocalActions.PRIVATE_MODE]: ['p'],
    [LocalActions.PAGE_NEXT]: ['Tab', 'Right'],
    [LocalActions.PAGE_PREVIOUS]: ['<Shift>ISO_Left_Tab', 'Left'],
    [LocalActions.MOVE_UP]: ['Up'],
    [LocalActions.MOVE_DOWN]: ['Down'],
    [LocalActions.CONFIRM]: ['Return', 'KP_Enter'],
    [LocalActions.CLOSE]: ['Escape'],
    [LocalActions.CASE_SENSITIVE]: ['<Alt>c'],
    [LocalActions.REGEX]: ['<Alt>r'],
};

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
for (let i = 1; i <= 12; i++)
    NAMED_KEYS[`f${i}`] = [0xffbd + i, `F${i}`];

// gtk accel string -> { keyval, mods }, null if junk/"Disabled"
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

function isAsciiLetter(keyval) {
    return (keyval >= 0x41 && keyval <= 0x5a) ||
        (keyval >= 0x61 && keyval <= 0x7a);
}

// match, tolerating shift-case on letter+modifier combos (alt+shift+c still hits <Alt>c)
export function matchesBinding(event, binding) {
    if (!binding)
        return false;
    const sym = event.get_key_symbol();
    if (sym !== binding.keyval) {
        const caseVariant = isAsciiLetter(sym) && isAsciiLetter(binding.keyval) &&
            (sym | 0x20) === (binding.keyval | 0x20) &&
            (binding.mods & ~ModMask.SHIFT) !== 0;
        if (!caseVariant)
            return false;
    }
    const state = event.get_state();
    return (state & binding.mods) === binding.mods;
}

export function matchesShortcut(event, bindings) {
    if (!Array.isArray(bindings))
        return false;
    return bindings.some(b => matchesBinding(event, b));
}

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
