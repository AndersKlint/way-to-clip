import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

const HIGHLIGHT_CSS_CLASS = 'waytoclip-shortcut-highlight';
const HIGHLIGHT_CSS = `.${HIGHLIGHT_CSS_CLASS} { background: alpha(@accent_bg_color, 0.18); border-radius: 12px; }`;
const HIGHLIGHT_DURATION_MS = 4000;
// Idle ticks before giving up waiting for layout and scrolling best-effort.
const SCROLL_RETRIES = 120;

/**
 * Highlights a keyboard shortcut in Settings prompting users to configure it themselves.
 * GNOME extension rules prohibit providing a default shortcut for clipboard-related functionality.
 */
export class ShortcutHighlighter {
    #row = null;

    #provider = null;

    #idleId = 0;

    #timeoutId = 0;

    #scrollRetriesLeft = 0;

    highlight(row, editor) {
        this.clear();
        this.#row = row;
        this.#provider = new Gtk.CssProvider();
        this.#provider.load_from_string(HIGHLIGHT_CSS);
        this.#row.get_style_context().add_provider(
            this.#provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        this.#row.add_css_class(HIGHLIGHT_CSS_CLASS);
        // Layout finishes on the frame clock after map, so poll until the row is allocated.
        this.#scrollRetriesLeft = SCROLL_RETRIES;
        this.#idleId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE, () => this.#waitForLayoutTick(editor));
    }

    clear() {
        if (this.#idleId) {
            GLib.source_remove(this.#idleId);
            this.#idleId = 0;
        }
        if (this.#timeoutId) {
            GLib.source_remove(this.#timeoutId);
            this.#timeoutId = 0;
        }
        this.#scrollRetriesLeft = 0;
        if (this.#row) {
            this.#row.remove_css_class(HIGHLIGHT_CSS_CLASS);
            this.#row.get_style_context().remove_provider(this.#provider);
        }
        this.#row = null;
        this.#provider = null;
    }

    destroy() {
        this.clear();
    }

    #waitForLayoutTick(editor) {
        if (!this.#row) {
            this.#idleId = 0;
            return GLib.SOURCE_REMOVE;
        }
        const scrolled = this.#findScrolledWindow(this.#row);
        if (!this.#isLaidOut(this.#row, scrolled)) {
            this.#scrollRetriesLeft -= 1;
            if (this.#scrollRetriesLeft > 0)
                return GLib.SOURCE_CONTINUE;
        }
        this.#idleId = 0;
        this.#revealNow(editor, scrolled);
        return GLib.SOURCE_REMOVE;
    }

    #revealNow(editor, scrolled) {
        editor.focusAddButton();
        if (scrolled)
            this.#centerRowIn(scrolled, this.#row);
        this.#timeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, HIGHLIGHT_DURATION_MS, () => {
                this.#timeoutId = 0;
                this.clear();
                return GLib.SOURCE_REMOVE;
            });
    }

    #isLaidOut(row, scrolled) {
        if (!scrolled || row.get_allocated_height() <= 0)
            return false;
        const adjustment = scrolled.get_vadjustment();
        return adjustment.get_upper() > adjustment.get_page_size();
    }

    #findScrolledWindow(row) {
        let scrolled = row.get_parent();
        while (scrolled && !(scrolled instanceof Gtk.ScrolledWindow))
            scrolled = scrolled.get_parent();
        return scrolled ?? null;
    }

    #centerRowIn(scrolled, row) {
        const viewport = scrolled.get_child();
        const content = viewport ? viewport.get_child() : null;
        if (!content)
            return;
        // Row coordinates are relative to the scrolled content, not the viewport.
        const translated = row.translate_coordinates(content, 0, 0);
        if (!translated || !translated[0])
            return;
        const adjustment = scrolled.get_vadjustment();
        const centered = translated[2] -
            Math.max(0, (viewport.get_allocated_height() - row.get_allocated_height()) / 2);
        const clamped = Math.min(
            Math.max(centered, adjustment.get_lower()),
            adjustment.get_upper() - adjustment.get_page_size());
        adjustment.set_value(clamped);
    }
}
