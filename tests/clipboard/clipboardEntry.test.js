import {ClipboardEntry} from '../../src/clipboard/clipboardEntry.js';
import {fakeEntry, test} from '../testHarness.js';

function textEntry(contents, favorite = false) {
    return new ClipboardEntry(
        ClipboardEntry.canonicalPlainTextMimetype,
        new TextEncoder().encode(contents),
        favorite);
}

test('fakeEntry covers ClipboardEntry interface', () => {
    const fake = fakeEntry('x');
    for (const m of ['equals', 'isFavorite', 'isText', 'isImage', 'getStringValue']) {
        if (typeof ClipboardEntry.prototype[m] !== 'function')
            throw new Error(`ClipboardEntry missing ${m}`);
        if (typeof fake[m] !== 'function' && m !== 'equals')
            throw new Error(`fakeEntry missing ${m}`);
    }
    if (typeof fake.equals !== 'function')
        throw new Error('fakeEntry missing equals');
});

test('entry detects text mimetypes', () => {
    for (const m of ['text/plain;charset=utf-8', 'text/plain', 'text/html', 'STRING', 'UTF8_STRING']) {
        if (!ClipboardEntry.isTextMimetype(m))
            throw new Error(`${m} must be text`);
    }
    for (const m of ['image/png', 'application/octet-stream']) {
        if (ClipboardEntry.isTextMimetype(m))
            throw new Error(`${m} must not be text`);
    }
});

test('entry canonicalizes plain text mimetypes', () => {
    const canonical = ClipboardEntry.canonicalPlainTextMimetype;
    for (const m of ['text/plain', 'text/plain;charset=utf-8', 'STRING', 'UTF8_STRING']) {
        if (!ClipboardEntry.isPlainTextMimetype(m))
            throw new Error(`${m} must be plain text`);
        if (ClipboardEntry.canonicalizeMimetype(m) !== canonical)
            throw new Error(`${m} must canonicalize`);
    }
    if (ClipboardEntry.isPlainTextMimetype('text/html'))
        throw new Error('text/html must not be plain text');
    if (ClipboardEntry.isPlainTextMimetype('image/png'))
        throw new Error('image/png must not be plain text');
    if (ClipboardEntry.canonicalizeMimetype('image/png') !== 'image/png')
        throw new Error('image mimetype must pass through');
});

test('entry constructor canonicalizes, copies and coerces', () => {
    const bytes = new TextEncoder().encode('hi');
    const entry = new ClipboardEntry('STRING', bytes, 1);
    if (entry.mimetype() !== ClipboardEntry.canonicalPlainTextMimetype)
        throw new Error('mimetype must canonicalize');
    if (entry.normalizedMimetype() !== ClipboardEntry.canonicalPlainTextMimetype)
        throw new Error('normalized mimetype must match');
    if (entry.isFavorite() !== true)
        throw new Error('favorite must coerce to boolean');
    bytes[0] = 0x58;
    if (entry.getStringValue() !== 'hi')
        throw new Error('constructor must copy bytes');
    const image = new ClipboardEntry('image/png', new Uint8Array([1, 2, 3]), false);
    if (!image.isImage() || image.isText())
        throw new Error('image flags wrong');
    if (image.normalizedMimetype() !== 'image/png')
        throw new Error('image mimetype must pass through');
});

test('entry favorite flag and text flags', () => {
    const entry = textEntry('x');
    if (entry.isFavorite())
        throw new Error('default favorite must be false');
    if (!entry.isText() || entry.isImage())
        throw new Error('text flags wrong');
    entry.favorite = 1;
    if (!entry.isFavorite())
        throw new Error('favorite setter must coerce');
    entry.favorite = 0;
    if (entry.isFavorite())
        throw new Error('favorite setter must clear');
});

test('entry serializes text to JSON', () => {
    const json = textEntry('hello', true).toJSON();
    if (json.contents !== 'hello' || json.favorite !== true)
        throw new Error(`unexpected json ${JSON.stringify(json)}`);
    if (json.mimetype !== ClipboardEntry.canonicalPlainTextMimetype)
        throw new Error('json mimetype must be canonical');
    const imageJson = new ClipboardEntry('image/png', new Uint8Array([1]), false).toJSON();
    if (imageJson.contents !== undefined)
        throw new Error('image contents must stay unresolved for Registry');
});

test('entry equality compares normalized mimetype and bytes', () => {
    if (!textEntry('same').equals(textEntry('same')))
        throw new Error('identical entries must be equal');
    if (textEntry('a').equals(textEntry('b')))
        throw new Error('different bytes must not be equal');
    const stringFlavor = new ClipboardEntry('STRING', new TextEncoder().encode('x'), false);
    if (!stringFlavor.equals(textEntry('x')))
        throw new Error('STRING and canonical plain text must be equal');
    if (textEntry('x').equals(fakeEntry('x')))
        throw new Error('non-entry must not be equal');
    if (textEntry('x').equals(null))
        throw new Error('null must not be equal');
});
