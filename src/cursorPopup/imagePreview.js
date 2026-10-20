import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

export const ImagePreview = GObject.registerClass(
class ImagePreview extends St.Widget {
    _init(imageFile, maxHeight, onLoaded) {
        super._init({
            style_class: 'waytoclip-item-image',
            clip_to_allocation: true,
            x_expand: true,
            request_mode: Clutter.RequestMode.HEIGHT_FOR_WIDTH,
        });
        this._imageFile = imageFile;
        this._maxHeight = maxHeight;
        this._paintScale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._resourceScale = null;
        this._previewWidth = maxHeight * this._paintScale;
        this._previewHeight = this._previewWidth;
        this._imageActor = null;
        this._contentSignalId = 0;
        this._placeholder = new St.Icon({
            icon_name: 'image-x-generic-symbolic',
            icon_size: 32,
        });
        this.add_child(this._placeholder);
        this._onLoaded = onLoaded;
        this._styleSignalId = this.connect('style-changed', () => this._loadImage());
        this._scaleSignalId = this.connect('resource-scale-changed', () => this._loadImage());
    }

    _loadImage() {
        if (!this.get_stage())
            return;
        const paintScale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const resourceScale = this.get_resource_scale();
        if (paintScale === this._paintScale && resourceScale === this._resourceScale)
            return;

        if (this._imageActor) {
            this._disconnectContentSignal();
            this._imageActor.destroy();
        }
        this._paintScale = paintScale;
        this._resourceScale = resourceScale;
        this._previewHeight = this._maxHeight * paintScale;
        this._previewWidth = this._previewHeight;
        this._placeholder.show();
        this._imageActor = St.TextureCache.get_default().load_file_async(
            this._imageFile, -1, this._maxHeight, paintScale, resourceScale);
        this.add_child(this._imageActor);
        this._contentSignalId = this._imageActor.connect('notify::content', () => this._onImageLoaded());
        this.queue_relayout();
        this._onImageLoaded();
    }

    _disconnectContentSignal() {
        if (this._contentSignalId) {
            this._imageActor.disconnect(this._contentSignalId);
            this._contentSignalId = 0;
        }
    }

    _onImageLoaded() {
        if (!this._imageActor.get_content())
            return;
        this._disconnectContentSignal();
        [, this._previewWidth] = this._imageActor.get_preferred_width(-1);
        [, this._previewHeight] = this._imageActor.get_preferred_height(-1);
        this._placeholder.hide();
        this.queue_relayout();
        if (this._onLoaded)
            this._onLoaded();
    }

    vfunc_get_preferred_width(_forHeight) {
        return [0, this._previewWidth];
    }

    vfunc_get_preferred_height(_forWidth) {
        return [this._previewHeight, this._previewHeight];
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const width = box.get_width();
        const height = box.get_height();
        const scale = Math.min(1, height / this._previewHeight);
        const imageWidth = this._previewWidth * scale;
        const imageHeight = this._previewHeight * scale;
        const imageBox = new Clutter.ActorBox();
        imageBox.set_origin(Math.min(0, (width - imageWidth) / 2), 0);
        imageBox.set_size(imageWidth, imageHeight);
        if (this._imageActor)
            this._imageActor.allocate(imageBox);
        if (this._placeholder.visible) {
            const placeholderBox = new Clutter.ActorBox();
            placeholderBox.set_origin(0, 0);
            placeholderBox.set_size(width, height);
            this._placeholder.allocate_align_fill(placeholderBox, 0, 0.5, false, false);
        }
    }

    vfunc_destroy() {
        this._disconnectContentSignal();
        this.disconnect(this._styleSignalId);
        this.disconnect(this._scaleSignalId);
        this._onLoaded = null;
        this._imageFile = null;
        this._imageActor = null;
        this._placeholder = null;
        super.vfunc_destroy();
    }
});
