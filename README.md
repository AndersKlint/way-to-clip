# WayToClip

A clipboard manager for GNOME with cursor-positioned popup and quick selection.
It reads the clipboard to keep a local history; clipboard contents stay on
your machine and are never shared.

## Features

- **Cursor Popup** - Show clipboard history at cursor position (set a shortcut in Settings, e.g. `Alt+X`)
- **Quick Selection** - Press keys `1-9` to instantly select and paste items
- **Auto-Paste** - Selected items are automatically pasted at cursor
- **Text & Images** - Supports both text and image clipboard content
- **Private Mode** - Disable clipboard history recording when needed (`p` in popup)
- **Panel Indicator** - Minimal panel menu (private-mode toggle, clear history, settings)
- **Search** - Filter clipboard history with `s` (case-sensitive/regex optional)
- **Configurable Shortcuts** - Popup, clear history and private mode shortcuts are customizable
- **No notifications** - Fully silent operation

## Keyboard Shortcuts

No global shortcuts are set by default. Open Settings to assign your own:

| Shortcut (suggested) | Action |
|----------|--------|
| `Alt+X` | Open/close cursor popup |
| `Ctrl+F10` | Clear history |
| `Ctrl+F8` | Toggle private mode |

### In-Popup Controls

- `0-9` - Select item by number
- `Up/Down` - Navigate items (wraps around)
- `Tab` / `Right` - Next page, `Shift+Tab` / `Left` - Previous page
- `Enter` - Paste selected item
- `s` - Toggle search mode
- `d` - Delete selected item
- `p` - Toggle private mode
- `Escape` - Close search or popup
- `Backspace` - Close popup (when not searching)

## Installation

### From Source

```bash
# Clone to your GNOME extensions directory
git clone <repo-url> ~/.local/share/gnome-shell/extensions/waytoclip@andersklint.github.io

# Restart GNOME Shell (Alt+F2, then type 'r' and press Enter)
# Or log out and log back in

# Enable the extension
gnome-extensions enable waytoclip@andersklint.github.io
```

> Upgrading from an older checkout? Remove the previous
> `waytoclip@waytoclip` directory first; the extension UUID changed
> before release and old installs (including `~/.cache/waytoclip@waytoclip/`)
> are not migrated automatically.

### Requirements

- GNOME 46, 47, 48, 49, 50, or 51

## Configuration

Open settings with:
```bash
gnome-extensions prefs waytoclip@andersklint.github.io
```

### Available Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-paste on selection | On | Automatically paste after selecting an item |
| Language | System | Interface language override (`system` follows GNOME language; requires restart) |
| History size | 100 | Maximum number of items to keep |
| Move item to top after selection | On | Reorder history on selection (re-copied duplicates always bubble up) |
| Popup position | At mouse cursor | Cursor or center of focused window |
| Number of pages | 3 | 10 items per page |

## How It Works

1. **Clipboard Monitoring**: The extension monitors clipboard changes automatically
2. **History Storage**: Items are persisted to `~/.cache/waytoclip@andersklint.github.io/`
3. **Selection**: When you select an item, it's copied to clipboard and pasted at cursor
4. **Private Mode**: When enabled, clipboard changes are not recorded

## Differences from Clipboard Indicator

WayToClip is based on [Clipboard Indicator](https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator) with these additions:

- Cursor-positioned popup (assign a shortcut in Settings, e.g. Alt+X)
- Quick selection with keys 1-9
- Auto-paste on selection
- Larger default history size (100 vs 15)

## License

MIT (see LICENSE.rst)
