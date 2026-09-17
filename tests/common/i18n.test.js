import {
    AVAILABLE_LANGUAGES,
    getLanguageOverride,
    getStoredLanguage,
    isKnownLanguage,
    LANGUAGE_LABELS,
    makeTranslator,
    normalizeLanguage,
    resetLanguageOverride,
    setLanguageOverride,
    syncOverrideFromSettings,
    translate
} from '../../src/common/i18n.js';
import {TRANSLATIONS} from '../../src/common/translations.js';
import {assert, test} from '../testHarness.js';

{
    assert(AVAILABLE_LANGUAGES.length === Object.keys(LANGUAGE_LABELS).length + 1,
        'language list covers all labels');
    assert(isKnownLanguage('system') && isKnownLanguage('de'), 'known languages');
    assert(!isKnownLanguage('xx'), 'unknown language rejected');
    assert(normalizeLanguage('de') === 'de', 'normalize keeps known code');
    assert(normalizeLanguage('xx') === 'system', 'normalize falls back to system');
    assert(normalizeLanguage('') === 'system', 'normalize empty to system');
    assert(normalizeLanguage(null) === 'system', 'normalize null to system');
    assert(normalizeLanguage('fr-FR') === 'fr_FR', 'normalize tolerates dashed region');
    assert(normalizeLanguage('pt-BR') === 'pt_BR', 'normalize tolerates dashed region variant');

    const fakeSettings = lang => ({get_string: () => lang});
    assert(getStoredLanguage(fakeSettings('de')) === 'de', 'stored language read');
    assert(getStoredLanguage(fakeSettings('xx')) === 'system', 'stored junk normalized');
    assert(getStoredLanguage({}) === 'system', 'stored missing key tolerated');
    assert(getStoredLanguage(null) === 'system', 'stored null tolerated');
    const throwingSettings = {get_string: () => {
        throw new Error('dconf gone');
    }};
    assert(getStoredLanguage(throwingSettings) === 'system', 'stored read error tolerated');

    const identity = s => s;
    setLanguageOverride('system');
    assert(getLanguageOverride() === 'system', 'override set/get system');
    assert(translate('Hello', identity) === 'Hello', 'system delegates to native');

    syncOverrideFromSettings(fakeSettings('de'));
    assert(getLanguageOverride() === 'de', 'override syncs from settings');
    syncOverrideFromSettings(fakeSettings('xx'));
    assert(getLanguageOverride() === 'system', 'override sync normalizes junk');
    resetLanguageOverride();
    assert(getLanguageOverride() === 'system', 'override resets to system');

    const native = s => `native:${s}`;
    assert(makeTranslator(native)('Hello') === 'native:Hello', 'translator delegates to native');
}

test('override translates every catalog hit and misses fall back', () => {
    const identity = s => s;
    let proven = 0;
    try {
        for (const [lang, catalog] of Object.entries(TRANSLATIONS)) {
            const msgids = Object.keys(catalog ?? {}).slice(0, 3);
            if (msgids.length === 0)
                continue;
            setLanguageOverride(lang);
            for (const msgid of msgids) {
                if (translate(msgid, identity) !== catalog[msgid])
                    throw new Error(`${lang} mistranslates ${msgid}`);
                proven++;
            }
            if (translate('__waytoclip_missing__', identity) !== '__waytoclip_missing__')
                throw new Error(`${lang} miss must fall back to native`);
        }
        if (proven === 0)
            throw new Error('no catalog entry exercised');
    } finally {
        resetLanguageOverride();
    }
    if (translate('Hello', identity) !== 'Hello')
        throw new Error('override must reset to system');
});

test('override empty catalog hit falls back to native', () => {
    const identity = s => s;
    const lang = Object.keys(TRANSLATIONS)[0];
    const catalog = TRANSLATIONS[lang];
    catalog.__waytoclip_empty__ = '';
    try {
        setLanguageOverride(lang);
        if (translate('__waytoclip_empty__', identity) !== '__waytoclip_empty__')
            throw new Error('empty hit must fall back to native');
    } finally {
        delete catalog.__waytoclip_empty__;
        resetLanguageOverride();
    }
});
