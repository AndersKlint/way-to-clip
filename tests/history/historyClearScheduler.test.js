import {HistoryClearScheduler} from '../../src/history/historyClearScheduler.js';
import {PrefsFields} from '../../src/common/constants.js';
import {test} from '../testHarness.js';

function fakeScheduler({snap, now = 1000}) {
    const persisted = {};
    const ticks = [];
    let clears = 0;
    const settings = {
        connect: () => 1,
        disconnect: () => {},
        set_int: (k, v) => {
            persisted[k] = v;
        },
    };
    const settingsManager = {snapshot: () => ({...snap})};
    const sched = new HistoryClearScheduler({
        settings,
        settingsManager,
        onClear: () => {
            clears++;
        },
        onTick: v => {
            ticks.push(v);
        },
        nowSeconds: () => now,
    });
    // stub the private arming hook so no real GLib timers run in tests.
    // This couples the suite to the _arm name; only rename it alongside this file.
    sched._arm = () => {};
    return {sched, persisted, ticks, clears: () => clears};
}

test('scheduler start disabled ticks -1', () => {
    const {sched, ticks} = fakeScheduler({
        snap: {clearHistoryOnInterval: false, clearHistoryInterval: 10, nextHistoryClear: 5},
    });
    sched.start();
    if (ticks.length !== 1 || ticks[0] !== -1)
        throw new Error(`expected single -1 tick, got ${JSON.stringify(ticks)}`);
    sched.destroy();
});

test('scheduler start with next===-1 schedules', () => {
    const {sched, persisted} = fakeScheduler({
        snap: {clearHistoryOnInterval: true, clearHistoryInterval: 10, nextHistoryClear: -1},
        now: 1000,
    });
    sched.start();
    const expected = 1000 + 10 * 60;
    if (persisted[PrefsFields.NEXT_HISTORY_CLEAR] !== expected)
        throw new Error(`expected next=${expected}, got ${persisted[PrefsFields.NEXT_HISTORY_CLEAR]}`);
    sched.destroy();
});

test('scheduler start with overdue fires onClear then reschedules', () => {
    const {sched, persisted, clears} = fakeScheduler({
        snap: {clearHistoryOnInterval: true, clearHistoryInterval: 10, nextHistoryClear: 500},
        now: 1000,
    });
    sched.start();
    if (clears() !== 1)
        throw new Error(`expected 1 clear, got ${clears()}`);
    const expected = 1000 + 10 * 60;
    if (persisted[PrefsFields.NEXT_HISTORY_CLEAR] !== expected)
        throw new Error(`expected reschedule to ${expected}`);
    sched.destroy();
});

test('scheduler schedule disabled persists -1', () => {
    const {sched, persisted, ticks} = fakeScheduler({
        snap: {clearHistoryOnInterval: false, clearHistoryInterval: 10, nextHistoryClear: 999},
    });
    sched.schedule();
    if (persisted[PrefsFields.NEXT_HISTORY_CLEAR] !== -1)
        throw new Error('expected -1 persisted');
    if (ticks[ticks.length - 1] !== -1)
        throw new Error('expected -1 tick');
    sched.destroy();
});

test('scheduler timeLeft', () => {
    const disabled = fakeScheduler({
        snap: {clearHistoryOnInterval: false, clearHistoryInterval: 10, nextHistoryClear: 2000},
        now: 1000,
    });
    if (disabled.sched.timeLeft() !== -1)
        throw new Error('disabled should be -1');
    disabled.sched.destroy();
    const enabled = fakeScheduler({
        snap: {clearHistoryOnInterval: true, clearHistoryInterval: 10, nextHistoryClear: 1500},
        now: 1000,
    });
    if (enabled.sched.timeLeft() !== 500)
        throw new Error(`expected 500, got ${enabled.sched.timeLeft()}`);
    enabled.sched.destroy();
});
