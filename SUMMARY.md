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
├── extension.js      - Thin entry (enable/disable) + WayToClip indicator wiring
├── src/
│   ├── settingsManager.js      - Typed Gio.Settings wrapper (replaces globals)
│   ├── historyStore.js         - Pure history/selection/trim model (unit-tested)
│   ├── clipboardEntry.js       - Clipboard item model (SHA256 filenames)
│   ├── clipboardMenuItem.js    - PopupMenuItem subclass (no monkey-patching)
│   ├── clipboardManager.js     - Clipboard monitoring, read/write, inhibit token
│   ├── shortcutManager.js      - Global keybinding lifecycle
│   ├── historyClearScheduler.js - Interval-clear timer (single dispose)
│   ├── autoPaster.js           - Paste keypresses + clipboard restore
│   │   ├── pasteKeys.js            - Pure paste-target decision (unit-tested)
│   └── logger.js               - Prefixed log helpers
├── cursor-popup/
│   ├── cursorPopup.js    - Popup lifecycle, paging, selection
│   ├── popupUI.js        - Widget construction and cursor-anchored positioning
│   ├── popupKeyHandler.js - Main/search key handling
│   └── popupSearch.js    - Filtering (case-sensitive/regex optional)
├── prefs.js            - Settings page assembly (GTK4/Adw)
├── prefs/
│   ├── stringListManager.js - Generic strv ExpanderRow manager (excluded/terminal apps)
│   └── shortcutRow.js  - Multi-shortcut chip editor (chips + x, plus to capture)
├── constants.js      - Settings keys + ITEMS_PER_PAGE + mimetypes
├── registry.js       - Coalesced atomic persistence (JSON cache + image files)
├── keyboard.js       - Virtual keyboard for auto-paste
├── confirmDialog.js  - Clear-history confirmation dialog
└── tests/runTests.js - Headless unit tests (`make check` / `gjs -m`)
```

## Key Classes
- `WayToClip` (extension.js): Indicator menus, wires managers together
- `HistoryStore` (src/): Pure history list, selection, trim/clear rules
- `ClipboardManager` (src/): Clipboard events, dedup callbacks, inhibit
- `Registry` (registry.js): Serialized atomic writes, hardened read
- `HistoryClearScheduler` (src/): Countdown timer with leak-free dispose
- `CursorPopup` (cursor-popup/): Floating popup with search, navigation, selection

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
| `cache-images` | boolean | true | Cache image content |
| `excluded-apps` | string[] | [] | Apps to exclude from monitoring |
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
| `toggle-popup` | strv | `Alt+X` | Toggle popup |
| `clear-history` | strv | `Ctrl+F10` | Clear history |
| `private-mode-binding` | strv | `Ctrl+F8` | Toggle private mode |

## Development

Reload extension:
```bash
gnome-extensions disable waytoclip@waytoclip && gnome-extensions enable waytoclip@waytoclip
```

## Dependencies
- GNOME Shell 46-51
- GJS (GNOME JavaScript bindings)
- GTK4/Adw (for preferences UI)
