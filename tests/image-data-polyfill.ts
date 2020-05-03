class ImageDataPolyfill {
    readonly data: Uint8ClampedArray;

    constructor(
        readonly width: number,
        readonly height: number
    ) {
        this.data = new Uint8ClampedArray(width * height * 4);
    }
}

(global as any).ImageData = ImageDataPolyfill;
