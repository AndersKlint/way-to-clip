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
- **Paged view**: 9 items per page, configurable page count
- **Click outside**: Close popup by clicking outside

## Architecture

```
├── extension.js      - Main extension class (WayToClip), panel indicator, clipboard monitoring
├── cursorPopup.js    - Floating popup UI and keyboard handling (extracted module)
├── prefs.js          - Settings UI (GTK4/Adw)
├── constants.js      - Settings key definitions
├── registry.js       - Clipboard data persistence (JSON cache)
├── keyboard.js       - Keyboard input utilities
└── confirmDialog.js  - Confirmation dialogs
```

## Key Classes
- `WayToClip` (extension.js): Main panel button, clipboard monitoring, menu management
- `CursorPopup` (cursorPopup.js): Floating popup with search, navigation, selection
- `Registry` (registry.js): File-based clipboard history storage

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+X` | Open/close cursor popup |
| `1-9` | Quick select item by number |
| `Up/Down` | Navigate items (wraps around) |
| `Tab` or `Right Arrow` | Next page (wraps to first) |
| `Shift+Tab` or `Left Arrow` | Previous page (wraps to last) |
| `Enter` | Paste selected item |
| `s` | Toggle search mode |
| `d` | Delete selected item |
| `Escape` | Close search or popup |
| `Backspace` | Close popup (when not searching) |

## Settings (org.gnome.shell.extensions.waytoclip)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `history-size` | int | 15 | Maximum clipboard history size |
| `preview-size` | int | 50 | Preview text length |
| `cache-size` | int | 5 | Cache file size limit (MB) |
| `cache-only-favorites` | boolean | false | Only cache favorite items |
| `enable-deletion` | boolean | true | Show delete buttons |
| `notify-on-copy` | boolean | true | Show notification on copy |
| `notify-on-cycle` | boolean | true | Notify when cycling history |
| `confirm-clear` | boolean | true | Confirm before clearing history |
| `move-item-first` | boolean | false | Move selected item to top |
| `enable-keybindings` | boolean | true | Enable keyboard shortcuts |
| `topbar-preview-size` | int | 15 | Top bar text preview length |
| `display-mode` | int | 1 | Top bar display mode (0=icon, 1=text, 2=both, 3=neither) |
| `disable-down-arrow` | boolean | false | Hide dropdown arrow |
| `strip-text` | boolean | false | Strip whitespace from text |
| `keep-selected-on-clear` | boolean | false | Keep selection when clearing |
| `paste-button` | boolean | true | Show paste button on items |
| `pinned-on-bottom` | boolean | false | Pin favorites to bottom |
| `cache-images` | boolean | true | Cache image content |
| `excluded-apps` | string[] | [] | Apps to exclude from monitoring |
| `clear-on-boot` | boolean | false | Clear history on login |
| `paste-on-select` | boolean | false | Auto-paste when selecting |
| `auto-paste` | boolean | true | Auto-paste after selection in popup |
| `popup-position-mode` | int | 0 | Popup position (0=cursor, 1=window center) |
| `popup-pages` | int | 3 | Number of pages in popup (1-11) |
| `case-sensitive-search` | boolean | false | Case-sensitive search |
| `regex-search` | boolean | false | Enable regex in search |
| `clear-history-on-interval` | boolean | false | Auto-clear on interval |
| `clear-history-interval` | int | 60 | Clear interval (minutes) |

## Development

Reload extension:
```bash
gnome-extensions disable waytoclip@waytoclip && gnome-extensions enable waytoclip@waytoclip
```

## Dependencies
- GNOME Shell 46-49
- GJS (GNOME JavaScript bindings)
- GTK4/Adw (for preferences UI)
