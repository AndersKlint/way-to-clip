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
