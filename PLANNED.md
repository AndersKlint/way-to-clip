control center gui, where we can browser clipboard history and mass edit (questionable feature, maybe we just keep it simple)

customizable default size of popup

custom keyboard shortcuts for 1 - 0

type to search (? needed? in that case we need to disable local one key shortcuts if enabled)

popup at input field instead of cursor

2. metadata.json:12 212 chars > 200-char review limit
   Plan: shorten to <200 chars, e.g. keep clipboard declaration but split with \n, e.g. "A clipboard manager with quick popup selection.\nClipboard contents stay local and are never shared." Verify shell-version:46-51 — if 51 is still dev on upload day, drop to stable-only + max one dev.
3. src/common/translations.js 20+ lines >200 chars, 2000-line file freezes review UI
   Auto-generated, but still reviewed. Plan: update tools/build-translations.py to emit wrapped values via string concatenation keeping every physical line <200 chars, no semantic change. Alternative if reviewer still complains: split per-language prefs/translations/\*.js.
