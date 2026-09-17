let failureCount = 0;

export function test(testName, testBody) {
    try {
        testBody();
        print(`ok - ${testName}`);
    } catch (e) {
        print(`FAIL - ${testName}: ${e.message}`);
        failureCount++;
    }
}

export function assert(condition, testName) {
    if (condition) {
        print(`ok - ${testName}`);
    } else {
        print(`FAIL - ${testName}`);
        failureCount++;
    }
}

export function getFailureCount() {
    return failureCount;
}

export function fakeEntry(entryText, isFavoriteEntry = false) {
    return {
        _value: entryText,
        _favorite: isFavoriteEntry,
        isFavorite() {
            return this._favorite;
        },
        set favorite(newFavorite) {
            this._favorite = !!newFavorite;
        },
        getStringValue() {
            return this._value;
        },
        mimetype() {
            return 'text/plain;charset=utf-8';
        },
        isText() {
            return true;
        },
        isImage() {
            return false;
        },
        equals(other) {
            return other && other.getStringValue() === this._value;
        },
    };
}
