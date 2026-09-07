import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

export class DialogManager {
    #openDialog = null;

    open({ title, message, subMessage, okLabel, cancelLabel, onConfirm } = {}) {
        // Back-compat: open(title, message, sub_message, ok, cancel, cb)
        if (typeof title === 'string') {
            const [t, m, sm, ok, cancel, cb] = arguments;
            return this.open({ title: t, message: m, subMessage: sm, okLabel: ok, cancelLabel: cancel, onConfirm: cb });
        }
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
                text: title,
            }));

            const description = subMessage ? `${message}\n${subMessage}` : message;
            messageBox.add_child(new St.Label({
                style: 'padding-top: 12px',
                x_align: Clutter.ActorAlign.CENTER,
                text: description,
            }));

            this.setButtons([
                {
                    label: cancelLabel,
                    action: () => {
                        this.close();
                        this._onFinish();
                    },
                    key: Clutter.Escape,
                },
                {
                    label: okLabel,
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
