import {
    isSecretHintMimetype,
    isSecretHintPayload,
    isStrictSecretText,
    SECRET_HINT_MIMETYPES
} from '../../src/clipboard/secretHints.js';
import {test} from '../testHarness.js';

test('secret hint mimetypes cover kde, gnome and concealed', () => {
    for (const m of ['x-kde-passwordManagerHint', 'x-gnome-passwordManagerHint',
        'application/x-nspasteboard-concealed-type']) {
        if (!SECRET_HINT_MIMETYPES.includes(m))
            throw new Error(`missing ${m}`);
        if (!isSecretHintMimetype(m))
            throw new Error(`not detected ${m}`);
    }
    if (isSecretHintMimetype('text/plain'))
        throw new Error('text/plain must not be secret');
    if (!isSecretHintMimetype('X-KDE-PASSWORDMANAGERHINT'))
        throw new Error('mimetype match must be case-insensitive');
});

test('secret hint value is strict secret only', () => {
    for (const good of ['secret', 'secret\n', 'secret\0', ' secret ']) {
        if (!isStrictSecretText(good))
            throw new Error(`must match ${JSON.stringify(good)}`);
    }
    for (const bad of ['Secret', 'SECRET', 'secret1', 'secrets', '', 'true', null, undefined, 42]) {
        if (isStrictSecretText(bad))
            throw new Error(`must not match ${String(bad)}`);
    }
});

test('secret hint payload rules', () => {
    const kde = 'x-kde-passwordManagerHint';
    const gnome = 'x-gnome-passwordManagerHint';
    const concealed = 'application/x-nspasteboard-concealed-type';
    if (!isSecretHintPayload(kde, 'secret'))
        throw new Error('kde secret must match');
    if (!isSecretHintPayload(kde, new TextEncoder().encode('secret')))
        throw new Error('kde secret bytes must match');
    if (isSecretHintPayload(kde, 'Secret'))
        throw new Error('kde value must be case-sensitive');
    if (isSecretHintPayload(kde, ''))
        throw new Error('kde empty must not match');
    if (!isSecretHintPayload(gnome, 'secret'))
        throw new Error('gnome secret must match');
    if (!isSecretHintPayload(concealed, ''))
        throw new Error('concealed type is secret by presence');
    if (!isSecretHintPayload(concealed, null))
        throw new Error('concealed type is secret regardless of value');
    if (isSecretHintPayload('text/plain', 'secret'))
        throw new Error('plain text is never a hint');
});
