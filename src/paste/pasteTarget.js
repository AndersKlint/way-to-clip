export const PasteMode = {
    TERMINAL: 'terminal',
    TEXT: 'text',
};

// snapshot at popup-open, before the grab steals focus
export function snapshotPasteTarget({ isPurposeTerminal, isTerminalWindow }) {
    return { isPurposeTerminal: !!isPurposeTerminal, isTerminalWindow: !!isTerminalWindow };
}

// terminal -> ctrl+shift+v, else ctrl+v. either terminal sighting wins
// (snapshot covers the popup stealing focus, live covers focus coming back)
export function decidePasteMode(target, isLiveTerminal) {
    if (target?.isTerminalWindow || target?.isPurposeTerminal || isLiveTerminal)
        return PasteMode.TERMINAL;
    return PasteMode.TEXT;
}

// is this window one of the user's terminals? (no hardcoded list, setting is truth)
export function isTerminalWindow(wmClass, appId, ids = []) {
    const terminals = new Set();
    if (Array.isArray(ids)) {
        for (const id of ids) {
            if (typeof id === 'string' && id.trim() !== '')
                terminals.add(id.trim().toLowerCase());
        }
    }
    for (const id of [wmClass, appId]) {
        if (typeof id !== 'string')
            continue;
        if (terminals.has(id.toLowerCase()))
            return true;
    }
    return false;
}
