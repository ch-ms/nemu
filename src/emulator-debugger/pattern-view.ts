import {Ppu, PpuConstants} from '../ppu';
import {ppuPalette} from '../ppu-palette';
import {Color} from '../color';

class PatternView {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly imageData: ImageData;

    constructor(private readonly container: HTMLElement) {
        const canvas = container.querySelector('canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
            throw new Error('Cant get context from canvas');
        }

        this.ctx = ctx;
        this.imageData = ctx.createImageData(canvas.width, canvas.height);
    }

    // $0000-$0FFF - left ptr table
    // $1000-$1FFF - right ptr table
    render(ppu: Ppu): void {
        // TODO pattern left right
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const tileOffset = y * 256 + x * 16;
                for (let row = 0; row < 8; row++) {
                    // 8 bytes lsb followed by 8 bytes msb
                    const lsbRow = ppu.ppuRead(tileOffset + row);
                    const msbRow = ppu.ppuRead(tileOffset + row + 8);
                    for (let col = 0; col < 8; col++) {
                        const lsb = (lsbRow >> col) & 0x1;
                        const msb = (msbRow >> col) & 0x1;
                        const pattern = (msb << 1) | lsb;
                        // TODO: choose palette
                        const color = this.getColorFromPalette(ppu, 0, pattern);
                        const pixel = ((y * 8 + row) * 16 * 8 + x * 8 + (7 - col)) * 4;
                        this.imageData.data[pixel + 0] = color[0];
                        this.imageData.data[pixel + 1] = color[1];
                        this.imageData.data[pixel + 2] = color[2];
                        this.imageData.data[pixel + 3] = 255;
                    }
                }
            }
        }

        this.ctx.putImageData(this.imageData, 0, 0);
    }

    private getColorFromPalette(ppu: Ppu, palette: number, pixel: number): Color {
        return ppuPalette[ppu.ppuRead(PpuConstants.PALETTE_START_ADDR + (palette * 4) + pixel) & 0x3F];
    }
}

export {PatternView};
