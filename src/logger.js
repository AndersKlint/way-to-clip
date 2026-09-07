/**
 * Logger - prefixed console helpers for WayToClip.
 *
 * Keeps log formatting in one place so call sites stay clean and
 * grep-able. Pure JS, no GNOME dependencies (testable with gjs -m).
 */

const TAG = 'WayToClip';

export function log(...args) {
    console.log(TAG + ':', ...args);
}

export function warn(...args) {
    console.warn(TAG + ':', ...args);
}

export function error(...args) {
    console.error(TAG + ':', ...args);
}
