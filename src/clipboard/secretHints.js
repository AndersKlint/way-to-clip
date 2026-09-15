const VALUE_SECRET_MIMETYPES = [
    'x-kde-passwordmanagerhint',
    'x-gnome-passwordmanagerhint',
];

const PRESENCE_SECRET_MIMETYPES = [
    'application/x-nspasteboard-concealed-type',
];

export const SECRET_HINT_MIMETYPES = [
    'x-kde-passwordManagerHint',
    'x-gnome-passwordManagerHint',
    'application/x-nspasteboard-concealed-type',
];

function normalizedMimetype(mimetype) {
    return typeof mimetype === 'string' ? mimetype.toLowerCase() : '';
}

export function isValueSecretMimetype(mimetype) {
    return VALUE_SECRET_MIMETYPES.includes(normalizedMimetype(mimetype));
}

export function isPresenceSecretMimetype(mimetype) {
    return PRESENCE_SECRET_MIMETYPES.includes(normalizedMimetype(mimetype));
}

export function isSecretHintMimetype(mimetype) {
    const normalized = normalizedMimetype(mimetype);
    return VALUE_SECRET_MIMETYPES.includes(normalized) ||
        PRESENCE_SECRET_MIMETYPES.includes(normalized);
}

// strict: exact case-sensitive 'secret' after stripping NULs and whitespace
export function isStrictSecretText(text) {
    if (typeof text !== 'string')
        return false;
    return text.replace(/\0/g, '').trim() === 'secret';
}

export function decodeSecretBytes(bytes) {
    if (typeof bytes === 'string')
        return bytes;
    if (bytes instanceof Uint8Array)
        return new TextDecoder().decode(bytes);
    if (bytes && typeof bytes.get_data === 'function') {
        const data = bytes.get_data();
        if (typeof data === 'string')
            return data;
        if (data instanceof Uint8Array)
            return new TextDecoder().decode(data);
    }
    return '';
}

// presence mimetypes are secret on sight, value mimetypes need strict 'secret'
export function isSecretHintPayload(mimetype, bytesOrText) {
    if (isPresenceSecretMimetype(mimetype))
        return true;
    if (!isValueSecretMimetype(mimetype))
        return false;
    const text = typeof bytesOrText === 'string'
        ? bytesOrText
        : decodeSecretBytes(bytesOrText);
    return isStrictSecretText(text);
}
