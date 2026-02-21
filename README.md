# WayToClip

A clipboard manager for GNOME with cursor-positioned popup and quick selection.

## Features

- **Cursor Popup** - Press `Alt+X` to show clipboard history at cursor position
- **Quick Selection** - Press keys `1-9` to instantly select and paste items
- **Auto-Paste** - Selected items are automatically pasted at cursor
- **Text & Images** - Supports both text and image clipboard content
- **Pinned Items** - Pin frequently used items to keep them at the top
- **Private Mode** - Disable clipboard history recording when needed
- **Panel Indicator** - Optional panel icon with dropdown menu
- **Search** - Search through clipboard history
- **Configurable Shortcuts** - All keyboard shortcuts are customizable

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+X` | Open/close cursor popup |
| `1-9` | Select item by number (in popup) |
| `Ctrl+F9` | Toggle panel menu |
| `Ctrl+F10` | Clear history |
| `Ctrl+F11` | Previous entry |
| `Ctrl+F12` | Next entry |
| `Ctrl+F8` | Toggle private mode |

### In-Menu Controls

- Arrow keys - Navigate items
- `v` - Paste selected item
- `p` - Pin/unpin item
- `Delete` - Delete item
- `Escape` - Close popup

## Installation

### From Source

```bash
# Clone to your GNOME extensions directory
git clone <repo-url> ~/.local/share/gnome-shell/extensions/waytoclip@waytoclip

# Restart GNOME Shell (Alt+F2, then type 'r' and press Enter)
# Or log out and log back in

# Enable the extension
gnome-extensions enable waytoclip@waytoclip
```

### Requirements

- GNOME 46, 47, 48, or 49

## Configuration

Open settings with:
```bash
gnome-extensions prefs waytoclip@waytoclip
```

### Available Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-paste on selection | On | Automatically paste after selecting an item |
| History size | 100 | Maximum number of items to keep |
| Preview size | 30 | Characters to show for each item |
| Panel indicator | Icon only | What to show in the top bar |

## How It Works

1. **Clipboard Monitoring**: The extension monitors clipboard changes automatically
2. **History Storage**: Items are persisted to `~/.cache/waytoclip@waytoclip/`
3. **Selection**: When you select an item, it's copied to clipboard and pasted at cursor
4. **Private Mode**: When enabled, clipboard changes are not recorded

## Differences from Clipboard Indicator

WayToClip is based on [Clipboard Indicator](https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator) with these additions:

- Cursor-positioned popup (Alt+X)
- Quick selection with keys 1-9
- Auto-paste on selection
- Larger default history size (100 vs 15)

## License

MIT OR Apache-2.0
