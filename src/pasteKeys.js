/**
 * pasteKeys - pure paste-keystroke decision logic for AutoPaster.
 *
 * Dependency-free (no Clutter/Shell imports) so it is unit testable
 * with plain gjs. Callers pass the Clutter.InputContentPurpose values
 * in; this module only compares them.
 */

export const PasteMode = {
    TERMINAL: 'terminal',
    TEXT: 'text',
};

/**
 * @typedef {object} PasteTarget - target-app snapshot taken at popup-open.
 * @property {*} purpose - input purpose while the target still had focus
 *   (Keyboard.savedPurpose; may be null/undefined)
 * @property {boolean} windowIsTerminal - focused window looked like a
 *   terminal emulator (covers setups where the input method never
 *   reports a purpose at all)
 */

/**
 * Build a PasteTarget snapshot. Call while the target app still has
 * focus, before the popup's modal grab steals it.
 */
export function snapshotPasteTarget(purpose, windowIsTerminal) {
    return { purpose, windowIsTerminal: !!windowIsTerminal };
}

/**
 * Decide which paste keystroke to synthesize (TERMINAL -> Ctrl+Shift+V,
 * TEXT -> Ctrl+V).
 *
 * Either observation of a terminal input wins: the snapshot purpose
 * covers the main flow, where opening the modal popup steals
 * input-method focus and resets the live content-purpose to NORMAL
 * before the paste keystroke fires. The live value covers flows where
 * focus only returns to the terminal afterwards. Both observations can
 * miss a terminal (false NORMAL during focus transitions) but neither
 * reports TERMINAL spuriously, so a union cannot misroute a plain text
 * field to the terminal keystroke while a missed terminal would get a
 * plain Ctrl+V (which VTE terminals don't bind to clipboard paste)
 * instead of the chosen entry.
 *
 * The window snapshot covers systems where the input method never
 * reports a purpose at all (e.g. non-IBus setups).
 *
 * @param {PasteTarget|null} target - snapshot from popup-open time
 *   (null when pasting without a prior open)
 * @param {*} livePurpose - Keyboard.purpose (may be undefined)
 * @param {*} terminalPurpose - Clutter.InputContentPurpose.TERMINAL
 * @returns {string} PasteMode.TERMINAL or PasteMode.TEXT
 */
export function decidePasteMode(target, livePurpose, terminalPurpose) {
    if (target?.windowIsTerminal)
        return PasteMode.TERMINAL;
    if (target?.purpose === terminalPurpose || livePurpose === terminalPurpose)
        return PasteMode.TERMINAL;
    return PasteMode.TEXT;
}

/**
 * Check whether a focused window belongs to a terminal emulator.
 * The ids come from the terminal-apps setting (pre-filled with common
 * terminals, user-extensible); matching is case-insensitive. There is
 * deliberately no hard-coded list here so the setting stays the single
 * source of truth. Note this deliberately excludes general editors/IDEs
 * with integrated terminals (e.g. VS Code): misrouting those would send
 * Ctrl+Shift+V to an editor.
 *
 * @param {string|null} wmClass - window.get_wm_class() (app id on Wayland)
 * @param {string|null} appId - window app id (may be null)
 * @param {string[]} ids - window classes/app ids treated as terminals
 * @returns {boolean}
 */
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
