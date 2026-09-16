#!/usr/bin/env python3
"""Generate locale/zh_TW/LC_MESSAGES/waytoclip.po from zh_CN via OpenCC.

Source of truth is the Simplified Chinese catalog. The script copies every
entry verbatim (msgid, references, flags) and converts only msgstr content
to Traditional Chinese (Taiwan). TAIWAN_OVERRIDES fixes OpenCC misses and
over-conversions. Re-run after zh_CN changes; manual edits to zh_TW.po get
overwritten.

Usage:
    python3 tools/sync-traditional-chinese.py [--config s2tw] [--check]

    --config selects the OpenCC conversion (default s2tw).
    --check exits 1 when zh_TW.po is stale instead of writing it.

Requires: pip install opencc-python-reimplemented
"""

import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "locale" / "zh_CN" / "LC_MESSAGES" / "waytoclip.po"
DST = ROOT / "locale" / "zh_TW" / "LC_MESSAGES" / "waytoclip.po"
DEFAULT_CONFIG = "s2twp"

NOTE_LINES = [
    "# Traditional Chinese (Taiwan) auto-converted from zh_CN with OpenCC.\n",
    "# Do not edit by hand, re-run tools/sync-traditional-chinese.py instead.\n",
]

MSGSTR_RE = re.compile(r'^(\s*msgstr(?:\[\d+\])?\s+)"(.*)"\s*$')
CONT_RE = re.compile(r'^(\s*)"(.*)"\s*$')
KEYWORD_RE = re.compile(r'^(msgid_plural|msgstr(?:\[\d+\])?|msgid|msgctxt)\b')

TAIWAN_OVERRIDES = [
    ("專案", "項目"),
    ("全域性", "全域"),
    ("擴充套件", "擴充功能"),
    ("型別", "類型"),
    ("密碼管理器", "密碼管理員"),
]


def decode_inner(inner):
    out = []
    i = 0
    while i < len(inner):
        if inner[i] == "\\" and i + 1 < len(inner):
            nxt = inner[i + 1]
            out.append({"n": "\n", "t": "\t", '"': '"', "\\": "\\"}.get(nxt, nxt))
            i += 2
        else:
            out.append(inner[i])
            i += 1
    return "".join(out)


def encode_inner(text):
    return (
        text.replace("\\", "\\\\")
        .replace("\t", "\\t")
        .replace("\n", "\\n")
        .replace('"', '\\"')
    )


def convert_literal(inner, convert):
    converted = convert(decode_inner(inner))
    for old, new in TAIWAN_OVERRIDES:
        converted = converted.replace(old, new)
    return encode_inner(converted)


def header_field_replacement(decoded, stamp, config):
    if decoded.startswith("Language:"):
        return "Language: zh_TW\n"
    if decoded.startswith("PO-Revision-Date:"):
        return f"PO-Revision-Date: {stamp}\n"
    if decoded.startswith("X-Converted-From:"):
        return f"X-Converted-From: zh_CN via tools/sync-traditional-chinese.py (OpenCC {config})\n"
    return None


def convert_po(src_text, convert, config):
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M%z")
    marker = (
        f"X-Converted-From: zh_CN via tools/sync-traditional-chinese.py"
        f" (OpenCC {config})\n"
    )
    lines = src_text.splitlines(keepends=True)
    out = []
    section = None
    block = 0
    note_done = False
    marker_done = False
    converted_blocks = set()

    def flush_header_marker():
        nonlocal marker_done
        if block == 0 and not marker_done:
            out.append(f'"{encode_inner(marker)}"\n')
            marker_done = True

    for line in lines:
        stripped = line.strip()
        if stripped == "":
            if block == 0:
                flush_header_marker()
            out.append(line)
            section = None
            block += 1
            continue
        if line.lstrip().startswith("#"):
            out.append(line)
            section = None
            continue
        keyword = KEYWORD_RE.match(stripped)
        if keyword:
            if block == 0 and keyword.group(1) == "msgid" and not note_done:
                out.extend(NOTE_LINES)
                note_done = True
            section = "msgstr" if keyword.group(1).startswith("msgstr") else "other"
            match = MSGSTR_RE.match(line.rstrip("\n"))
            if section == "msgstr" and match:
                prefix, inner = match.group(1), match.group(2)
                decoded = decode_inner(inner)
                if block == 0:
                    replacement = header_field_replacement(decoded, stamp, config)
                    if replacement is not None:
                        out.append(f'{prefix}"{encode_inner(replacement)}"\n')
                    else:
                        out.append(line)
                    if decoded.startswith("X-Converted-From:"):
                        marker_done = True
                elif decoded:
                    out.append(f'{prefix}"{convert_literal(inner, convert)}"\n')
                    converted_blocks.add(block)
                else:
                    out.append(line)
            else:
                out.append(line)
            continue
        match = CONT_RE.match(line.rstrip("\n"))
        if match and section == "msgstr":
            prefix, inner = match.group(1), match.group(2)
            decoded = decode_inner(inner)
            if block == 0:
                replacement = header_field_replacement(decoded, stamp, config)
                if replacement is not None:
                    out.append(f'{prefix}"{encode_inner(replacement)}"\n')
                else:
                    out.append(line)
                if decoded.startswith("X-Converted-From:"):
                    marker_done = True
            elif decoded:
                out.append(f'{prefix}"{convert_literal(inner, convert)}"\n')
                converted_blocks.add(block)
            else:
                out.append(line)
            continue
        out.append(line)
        section = None
    if block == 0:
        flush_header_marker()
    return "".join(out), len(converted_blocks)


def main(argv):
    config = DEFAULT_CONFIG
    check = False
    args = list(argv)
    i = 0
    while i < len(args):
        arg = args[i]
        if arg.startswith("--config="):
            config = arg.split("=", 1)[1]
        elif arg == "--config" and i + 1 < len(args):
            i += 1
            config = args[i]
        elif arg == "--check":
            check = True
        elif arg in ("-h", "--help"):
            print(__doc__.strip())
            return 0
        else:
            print(f"unknown argument: {arg}", file=sys.stderr)
            return 2
        i += 1
    try:
        from opencc import OpenCC
    except ImportError:
        print("missing OpenCC module, run: pip install opencc-python-reimplemented",
              file=sys.stderr)
        return 1
    if not SRC.is_file():
        print(f"source catalog not found: {SRC}", file=sys.stderr)
        return 1
    try:
        convert = OpenCC(config).convert
    except Exception as exc:
        print(f"unknown OpenCC config {config!r}: {exc}", file=sys.stderr)
        return 1
    generated, converted = convert_po(SRC.read_text(encoding="utf-8"), convert, config)
    if check:
        if not DST.is_file() or DST.read_text(encoding="utf-8") != generated:
            print(f"{DST} is stale, run tools/sync-traditional-chinese.py", file=sys.stderr)
            return 1
        print(f"zh_TW: up to date ({converted} strings, OpenCC {config})")
        return 0
    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_text(generated, encoding="utf-8")
    print(f"wrote {DST} ({converted} strings, OpenCC {config})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
