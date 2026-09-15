#!/usr/bin/env python3
"""Fail when shell or prefs code pulls in a banned GI import.

Shell closure from extension.js must not reach Gtk Gdk or Adw.
Prefs closure from prefs.js must not reach Clutter Meta St or Shell.
Shared helpers must stay free of gi and resource imports.
Usage: python3 tools/check-imports.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SHELL_BANNED = {"gi://Gtk", "gi://Gdk", "gi://Adw"}
PREFS_BANNED = {"gi://Clutter", "gi://Meta", "gi://St", "gi://Shell"}

SHARED = [
    "src/common/constants.js",
    "src/clipboard/secretHints.js",
    "src/common/logger.js",
    "src/common/i18n.js",
    "src/common/translations.js",
    "src/history/historyStore.js",
    "src/paste/pasteTarget.js",
    "src/cursorPopup/localShortcutUtils.js",
    "src/cursorPopup/popupSearch.js",
    "src/cursorPopup/popupSelectionController.js",
]

IMPORT_RE = re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]""")


def file_imports(path):
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    return IMPORT_RE.findall(text)


def resolve(base, spec):
    if not spec.startswith("."):
        return None
    target = (base.parent / spec).resolve()
    if target.is_dir():
        target = target / "index.js"
    if target.suffix == "":
        target = target.with_suffix(".js")
    try:
        target.relative_to(ROOT)
    except ValueError:
        return None
    if target.is_file():
        return target
    return None


def closure(entry):
    seen = set()
    stack = [ROOT / entry]
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        for spec in file_imports(current):
            target = resolve(current, spec)
            if target is not None and target not in seen:
                stack.append(target)
    return seen


def check(files, banned, label):
    failures = []
    for path in sorted(files):
        for spec in file_imports(path):
            if spec in banned:
                rel = path.relative_to(ROOT)
                failures.append(f"{label}: {rel} imports {spec}")
    return failures


def main():
    shell_files = closure("extension.js")
    prefs_files = closure("prefs.js")
    failures = []
    failures += check(shell_files, SHELL_BANNED, "shell")
    failures += check(prefs_files, PREFS_BANNED, "prefs")
    for rel in SHARED:
        path = ROOT / rel
        if not path.is_file():
            continue
        for spec in file_imports(path):
            if spec.startswith("gi://") or spec.startswith("resource://"):
                failures.append(f"shared: {rel} imports {spec}")
    if failures:
        for line in failures:
            print(line, file=sys.stderr)
        return 1
    print("imports ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
