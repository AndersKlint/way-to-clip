import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

export class DialogManager {
    #openDialog = null;

    open(firstArg = {}, ...rest) {
        // Back-compat: open(title, message, subMessage, okLabel, cancelLabel, cb)
        let opts;
        if (typeof firstArg === 'string') {
            const [message, subMessage, okLabel, cancelLabel, onConfirm] = rest;
            opts = { title: firstArg, message, subMessage, okLabel, cancelLabel, onConfirm };
        } else {
            opts = firstArg ?? {};
        }
        const { title, message, subMessage, okLabel, cancelLabel, onConfirm } = opts;
        if (this.#openDialog)
            return;
        this.#openDialog = new ConfirmDialog({
            title,
            message,
            subMessage,
            okLabel,
            cancelLabel,
            onConfirm,
            onFinish: () => {
                this.#openDialog = null;
            },
        });
        // If the dialog is closed/destroyed without going through a button
        // (e.g. Escape via ModalDialog itself), still release the guard so
        // the next Clear History attempt can open a fresh dialog.
        try {
            this.#openDialog.connect('destroy', () => {
                this.#openDialog = null;
            });
        } catch (_e) { /* connect is best-effort */ }
        this.#openDialog.open();
    }

    destroy() {
        if (this.#openDialog) {
            try {
                this.#openDialog.close();
            } catch (_e) { /* already closed */ }
            try {
                this.#openDialog.destroy();
            } catch (_e) { /* already destroyed */ }
            this.#openDialog = null;
        }
    }
}

const ConfirmDialog = GObject.registerClass(
    class ConfirmDialog extends ModalDialog.ModalDialog {
        _init({ title, message, subMessage, okLabel, cancelLabel, onConfirm, onFinish }) {
            super._init();
            this._onFinish = onFinish ?? (() => {});
            this._onConfirm = onConfirm ?? (() => {});

            const mainBox = new St.BoxLayout({ vertical: false });
            this.contentLayout.add_child(mainBox);

            const messageBox = new St.BoxLayout({ vertical: true });
            mainBox.add_child(messageBox);

            messageBox.add_child(new St.Label({
                style: 'font-weight: bold',
                x_align: Clutter.ActorAlign.CENTER,
                text: typeof title === 'string' ? title : String(title ?? ''),
            }));

            const description = subMessage ? `${message}\n${subMessage}` : message;
            messageBox.add_child(new St.Label({
                style: 'padding-top: 12px',
                x_align: Clutter.ActorAlign.CENTER,
                text: typeof description === 'string' ? description : String(description ?? ''),
            }));

            this.setButtons([
                {
                    label: typeof cancelLabel === 'string' ? cancelLabel : String(cancelLabel ?? 'Cancel'),
                    action: () => {
                        this.close();
                        this._onFinish();
                    },
                    key: Clutter.Escape,
                },
                {
                    label: typeof okLabel === 'string' ? okLabel : String(okLabel ?? 'OK'),
                    action: () => {
                        this.close();
                        this._onFinish();
                        this._onConfirm();
                    },
                },
            ]);
        }
    }
);
