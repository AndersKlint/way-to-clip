import GLib from 'gi://GLib';

import { PrefsFields } from '../common/constants.js';

export class HistoryClearScheduler {
    #settings;
    #settingsManager;
    #onClear;
    #onTick;
    #nowSeconds;
    #timeoutId = 0;
    #intervalId = 0;
    // manual signal-ID tracking: plain JS class, no GObject connectObject/disconnectObject
    #settingIds = [];

    constructor({ settings, settingsManager, onClear, onTick, nowSeconds }) {
        this.#settings = settings;
        this.#settingsManager = settingsManager;
        this.#onClear = onClear;
        this.#onTick = onTick ?? (() => {});
        this.#nowSeconds = nowSeconds ?? (() => Math.ceil(Date.now() / 1000));
    }

    start() {
        this.stopSignals();
        this.#settingIds = [
            this.#settings.connect(`changed::${PrefsFields.CLEAR_HISTORY_INTERVAL}`,
                () => this._onIntervalChanged()),
            this.#settings.connect(`changed::${PrefsFields.CLEAR_HISTORY_ON_INTERVAL}`,
                () => this._onToggleChanged()),
        ];

        const snap = this.#settingsManager.snapshot();
        if (!snap.clearHistoryOnInterval) {
            this.#onTick(-1);
            return;
        }

        const now = this.#nowSeconds();
        let next = snap.nextHistoryClear;
        if (next === -1) {
            this.schedule();
        } else if (next <= now) {
            this.#onClear();
            this.schedule();
        } else {
            this._arm(next - now);
        }
    }

    schedule() {
        this._clearTimers();
        const snap = this.#settingsManager.snapshot();
        if (!snap.clearHistoryOnInterval) {
            this._persistNext(-1);
            this.#onTick(-1);
            return;
        }
        const now = this.#nowSeconds();
        const next = now + snap.clearHistoryInterval * 60;
        this._persistNext(next);
        this._arm(next - now);
    }

    reset() {
        this._clearTimers();
        this._persistNext(-1);
        this.#onTick(-1);
    }

    // seconds left, -1 when off
    timeLeft() {
        const snap = this.#settingsManager.snapshot();
        if (!snap.clearHistoryOnInterval)
            return -1;
        return Math.max(0, snap.nextHistoryClear - this.#nowSeconds());
    }

    stopSignals() {
        for (const id of this.#settingIds)
            this.#settings.disconnect(id);
        this.#settingIds = [];
    }

    destroy() {
        this._clearTimers();
        this.stopSignals();
        this.#settings = null;
        this.#settingsManager = null;
        this.#onClear = null;
        this.#onTick = null;
    }

    // --- private ---

    _onIntervalChanged() {
        this.schedule();
    }

    _onToggleChanged() {
        const snap = this.#settingsManager.snapshot();
        if (snap.clearHistoryOnInterval)
            this.start();
        else
            this.reset();
    }

    _persistNext(timestamp) {
        this.#settings.set_int(PrefsFields.NEXT_HISTORY_CLEAR, timestamp);
    }

    _arm(secondsLeft) {
        this._clearTimers();
        this.#onTick(secondsLeft);
        this.#intervalId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 1, () => {
                this.#onTick(this.timeLeft());
                return GLib.SOURCE_CONTINUE;
            });
        this.#timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, Math.max(1, Math.ceil(secondsLeft)), () => {
                this.#timeoutId = 0;
                this.#onClear();
                this.schedule();
                return GLib.SOURCE_REMOVE;
            });
    }

    _clearTimers() {
        if (this.#timeoutId) {
            GLib.source_remove(this.#timeoutId);
            this.#timeoutId = 0;
        }
        if (this.#intervalId) {
            GLib.source_remove(this.#intervalId);
            this.#intervalId = 0;
        }
    }
}
