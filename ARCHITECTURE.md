# WayToClip - GNOME Shell Clipboard Manager Extension

## Purpose
A clipboard manager for GNOME Shell with cursor-positioned popup for quick selection and auto-paste functionality.

## Main Features
- **Cursor popup (Alt+X)**: Floating popup at mouse cursor or window center
- **Quick selection**: Press 1-9 to select items
- **Keyboard navigation**: Up/Down arrows, Tab/Shift+Tab for pages
- **Search (s)**: Filter clipboard items in real-time
- **Delete (d)**: Remove items from history
- **Auto-paste**: Automatically paste after selection
- **Paged view**: 10 items per page, configurable page count
- **Click outside**: Close popup by clicking outside
- **Silent**: No notifications whatsoever

## Architecture

```
├── extension.js      - Thin entry (enable/disable), must stay at root (GNOME)
├── prefs.js          - Settings page assembly (GTK4/Adw), must stay at root (GNOME)
├── src/
│   ├── common/       - Shared kernel: constants, logger, i18n, translations
│   ├── clipboard/    - clipboardManager (monitor/read/write/inhibit), clipboardEntry (SHA256 model)
│   ├── history/      - historyStore (pure model, unit-tested; favorites backend only, no UI yet),
│   │                    registry (atomic JSON+image persistence), historyClearScheduler
 │   ├── cursorPopup/  - cursorPopup (thin facade: open/close/settings fan-out),
 │   │                    popupLayoutPlacer (build/fit/anchor/reposition), popupSelectionController
 │   │                    (items/pages/highlight/delete), popupSearchController (search mode/filter/toggles),
 │   │                    popupLocalShortcuts (bindings + hint labels), popupUI, popupKeyHandler, popupSearch, localShortcuts
│   ├── wayToClipController.js - App controller: owns store, registry, clipboard,
│   │                    paster, scheduler, shortcuts, settings, popup lifecycle.
│   │                    Views exchange model entries, never widgets.
│   ├── panel/        - panelButton (WayToClip dumb view: static control rows only,
│   │                    clipboard data never appears here), confirmDialog
│   ├── paste/        - autoPaster (paste keypresses + restore), pasteTarget (pure decision, unit-tested), keyboard (virtual device)
│   └── settings/     - settingsManager (typed Gio.Settings), shortcutManager (global bindings), shortcutRow + stringListManager (prefs widgets)
└── tests/runTests.js - Headless unit tests (`make check` / `gjs -m`)
```

## Key Classes
- `WayToClipController` (src/wayToClipController.js): Owns all orchestration. Covers
  history mutations, clipboard events, private mode, popup lifecycle, settings. Exposes an
  entry-based API (`selectEntry`, `removeEntry`, `selectAndPaste`, `togglePrivateMode`,
  `requestClearHistory`); views never see widgets from other views.
- `WayToClip` (src/panel/panelButton.js): Dumb indicator view. Static control rows
  (popup, private mode, clear, settings), private-mode switch, countdown label.
  Never shows clipboard data; history surface is the cursor popup.
- `HistoryStore` (src/history/): Pure history list, selection, trim/clear rules
- `ClipboardManager` (src/clipboard/): Clipboard events, dedup callbacks, inhibit
- `Registry` (src/history/registry.js): Serialized atomic writes, hardened read
- `HistoryClearScheduler` (src/history/): Countdown timer with leak-free dispose
- `CursorPopup` (src/cursorPopup/cursorPopup.js): Thin facade (open/close/settings fan-out).
- Sub-controllers own one concern each and are wired in the facade ctor (keyHandler
- takes them directly, no facade pass-throughs): `PopupLayoutPlacer` (row build, 3/2/1-line
- fit, cursor-edge anchor, reposition), `PopupSelectionController` (visible items, paging,
- highlight, delete), `PopupSearchController` (search mode, filter, toggle buttons),
- `PopupLocalShortcuts` (key bindings, footer hint labels). `PopupSearch` stays a pure
- filter model with its own unit tests.

## Keyboard Shortcuts

Global (customizable):

| Shortcut | Action |
|----------|--------|
| `Alt+X` | Open/close cursor popup |
| `Ctrl+F10` | Clear history |
| `Ctrl+F8` | Toggle private mode |

In-popup:

| Key | Action |
|-----|--------|
| `0-9` | Quick select item by number |
| `Up/Down` | Navigate items (wraps around) |
| `Tab` or `Right` | Next page (wraps to first) |
| `Shift+Tab` or `Left` | Previous page (wraps to last) |
| `Enter` | Paste selected item |
| `s` | Toggle search mode |
| `d` | Delete selected item |
| `p` | Toggle private mode |
| `Escape` | Close search or popup |
| `Backspace` | Close popup (when not searching) |

## Settings (org.gnome.shell.extensions.waytoclip)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `history-size` | int | 100 | Maximum clipboard history size |
| `cache-size` | int | 5 | Cache file size limit (MB) |
| `cache-only-favorites` | boolean | false | Only persist pinned items (dormant, future) |
| `confirm-clear` | boolean | true | Confirm before clearing history |
| `move-item-first` | boolean | true | Move selected item to top (re-copied duplicates always bubble up) |
| `enable-keybindings` | boolean | true | Enable keyboard shortcuts |
| `keep-selected-on-clear` | boolean | false | Keep selection when clearing |
| `should-cache-images` | boolean | true | Cache image content |
| `excluded-apps` | string[] | [] | Apps to exclude from monitoring |
| `ignore-secret-mimetypes` | boolean | true | Skip clipboard offering a secret mimetype |
| `terminal-apps` | string[] | pre-filled terminal list | Window classes/app ids treated as terminals for auto-paste |
| `clear-on-boot` | boolean | false | Clear history on login |
| `auto-paste` | boolean | true | Auto-paste after selection in popup |
| `popup-position-mode` | int | 0 | Popup position (0=cursor, 1=window center) |
| `popup-pages` | int | 3 | Max pages in popup when limited (10 items each) |
| `limit-popup-pages` | boolean | false | Cap popup to popup-pages; when false show full history |
| `case-sensitive-search` | boolean | false | Case-sensitive search |
| `regex-search` | boolean | false | Enable regex in search |
| `clear-history-on-interval` | boolean | false | Auto-clear on interval |
| `clear-history-interval` | int | 60 | Clear interval (minutes) |
| `next-history-clear` | int | -1 | Next scheduled clear timestamp |
| `language` | string | `system` | Interface language override (`system` = GNOME language; restart required) |
| `toggle-popup` | strv | `[]` | Toggle popup (no default; user assigns in Settings) |
| `clear-history` | strv | `[]` | Clear history |
| `private-mode-binding` | strv | `[]` | Toggle private mode |

## Development

Reload extension:
```bash
gnome-extensions disable waytoclip@andersklint.github.io && gnome-extensions enable waytoclip@andersklint.github.io
```

## Dependencies
- GNOME Shell 46-51
- GJS (GNOME JavaScript bindings)
- GTK4/Adw (for preferences UI)
