import {decidePasteMode, isTerminalWindow, PasteMode, snapshotPasteTarget} from '../../src/paste/pasteTarget.js';
import {assert} from '../testHarness.js';

{
    const T = (isPurposeTerminal, isTerminalWindowFlag = false) =>
        snapshotPasteTarget({isPurposeTerminal, isTerminalWindow: isTerminalWindowFlag});

    assert(snapshotPasteTarget({isPurposeTerminal: 1, isTerminalWindow: 1}).isTerminalWindow === true,
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
