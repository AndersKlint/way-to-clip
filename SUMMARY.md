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
├── extension.js      - Clipboard monitoring, minimal panel menu, cursor-popup wiring
├── cursor-popup/
│   ├── cursorPopup.js    - Popup lifecycle, paging, selection
│   ├── popupUI.js        - Widget construction and cursor-anchored positioning
│   ├── popupKeyHandler.js - Main/search key handling
│   └── popupSearch.js    - Filtering (case-sensitive/regex optional)
├── prefs.js          - Settings UI (GTK4/Adw)
├── constants.js      - Settings key definitions
├── registry.js       - Clipboard data persistence (JSON cache + image files)
├── keyboard.js       - Virtual keyboard for auto-paste
└── confirmDialog.js  - Clear-history confirmation dialog
```

## Key Classes
- `WayToClip` (extension.js): Clipboard monitoring, minimal panel menu (private toggle, clear, settings)
- `CursorPopup` (cursor-popup/): Floating popup with search, navigation, selection
- `Registry` (registry.js): File-based clipboard history storage

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
| `move-item-first` | boolean | false | Move selected item to top |
| `enable-keybindings` | boolean | true | Enable keyboard shortcuts |
| `keep-selected-on-clear` | boolean | false | Keep selection when clearing |
| `cache-images` | boolean | true | Cache image content |
| `excluded-apps` | string[] | [] | Apps to exclude from monitoring |
| `clear-on-boot` | boolean | false | Clear history on login |
| `auto-paste` | boolean | true | Auto-paste after selection in popup |
| `popup-position-mode` | int | 0 | Popup position (0=cursor, 1=window center) |
| `popup-pages` | int | 3 | Number of pages in popup (10 items each) |
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
