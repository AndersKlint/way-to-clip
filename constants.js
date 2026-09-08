export const PrefsFields = {
    HISTORY_SIZE                    : 'history-size',
    CACHE_FILE_SIZE                 : 'cache-size',
    CACHE_ONLY_FAVORITE             : 'cache-only-favorites',
    CONFIRM_ON_CLEAR                : 'confirm-clear',
    MOVE_ITEM_FIRST                 : 'move-item-first',
    ENABLE_KEYBINDING               : 'enable-keybindings',
    KEEP_SELECTED_ON_CLEAR          : 'keep-selected-on-clear',
    BINDING_TOGGLE_POPUP            : 'toggle-popup',
    BINDING_CLEAR_HISTORY           : 'clear-history',
    BINDING_PRIVATE_MODE            : 'private-mode-binding',
    CLEAR_ON_BOOT                   : 'clear-on-boot',
    AUTO_PASTE                      : 'auto-paste',
    POPUP_POSITION_MODE             : 'popup-position-mode',
    MAX_POPUP_PAGES                 : 'popup-pages',
    LIMIT_POPUP_PAGES               : 'limit-popup-pages',
    CACHE_IMAGES                    : 'cache-images',
    EXCLUDED_APPS                   : 'excluded-apps',
    TERMINAL_APPS                   : 'terminal-apps',
    CLEAR_HISTORY_ON_INTERVAL       : 'clear-history-on-interval',
    CLEAR_HISTORY_INTERVAL          : 'clear-history-interval',
    NEXT_HISTORY_CLEAR              : 'next-history-clear',
    CASE_SENSITIVE_SEARCH           : 'case-sensitive-search',
    REGEX_SEARCH                    : 'regex-search',
    IMAGE_PREVIEW_SIZE              : 'image-preview-size',
};

/** Number of clipboard rows shown per popup page. */
export const ITEMS_PER_PAGE = 10;

/** Clipboard mimetypes probed in priority order (text first, then images). */
export const CLIPBOARD_MIMETYPES = [
    'text/plain;charset=utf-8',
    'UTF8_STRING',
    'text/plain',
    'STRING',
    'image/gif',
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'text/html',
];

/** Popup placement modes (mirrors popup-position-mode schema). */
export const PopupPositionMode = {
    CURSOR: 0,
    WINDOW_CENTER: 1,
};
