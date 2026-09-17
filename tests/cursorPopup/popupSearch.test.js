import {PopupSearch} from '../../src/cursorPopup/popupSearch.js';
import {assert, fakeEntry} from '../testHarness.js';

{
    const search = new PopupSearch();
    const items = [fakeEntry('Hello'), fakeEntry('world'), fakeEntry('HELLO again')];
    search.applySettings(false, false);
    assert(search.filter(items, '').length === 3, 'search empty query returns all');
    assert(search.filter(items, 'hello').length === 2, 'search case-insensitive');
    search.applySettings(true, false);
    assert(search.filter(items, 'hello').length === 0, 'search case-sensitive');
    assert(search.filter(items, 'Hello').length === 1, 'search case-sensitive match');
    search.applySettings(false, true);
    assert(search.filter(items, 'h.llo').length === 2, 'search regex');
    assert(search.filter(items, '([').length === 0, 'search invalid regex falls back');
}

{
    // Accessors used by the popup's Aa/.* toggle buttons.
    const search = new PopupSearch();
    assert(search.caseSensitive === false && search.regexEnabled === false,
        'search toggles default off');
    search.setCaseSensitive(true);
    search.setRegexEnabled(true);
    assert(search.caseSensitive === true && search.regexEnabled === true,
        'search toggle setters flip on');
    search.applySettings(false, false);
    assert(search.caseSensitive === false && search.regexEnabled === false,
        'search applySettings resets toggles');
    const items = [fakeEntry('Hello'), fakeEntry('hello')];
    search.setCaseSensitive(true);
    assert(search.filter(items, 'hello').length === 1, 'search toggle setter affects filter');
}

{
    // Regex regression with raw query and flag instead of a lowercased pattern.
    const search = new PopupSearch();
    search.applySettings(false, true);
    const items = [fakeEntry('hello'), fakeEntry('HELLO'), fakeEntry('123')];
    assert(search.filter(items, '[A-Z]+').length === 2,
        'search case-insensitive regex uses raw pattern with i flag');
    search.applySettings(true, true);
    assert(search.filter(items, '[A-Z]+').length === 1,
        'search case-sensitive regex respects case');
    search.applySettings(false, true);
    const paren = [fakeEntry('a(b'), fakeEntry('xyz')];
    assert(search.filter(paren, '(').length === 1,
        'search invalid regex falls back to plain contains');
}
