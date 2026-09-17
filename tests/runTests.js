// headless tests for the pure bits, run with: gjs -m tests/runTests.js (or make check)
import {getFailureCount} from './testHarness.js';
import './history/historyStore.test.js';
import './history/historyClearScheduler.test.js';
import './cursorPopup/popupSearch.test.js';
import './cursorPopup/popupSelectionController.test.js';
import './cursorPopup/localShortcutUtils.test.js';
import './paste/pasteTarget.test.js';
import './clipboard/secretHints.test.js';
import './clipboard/clipboardEntry.test.js';
import './common/i18n.test.js';

const failureCount = getFailureCount();
if (failureCount > 0) {
    print(`${failureCount} test(s) FAILED`);
    throw new Error(`${failureCount} test(s) failed`);
} else {
    print('All tests passed');
}
