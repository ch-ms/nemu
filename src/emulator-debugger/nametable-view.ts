import {Ppu, PpuConstants} from '../ppu';
import {PPU_PALETTE} from '../ppu-palette';
import {Color} from '../color';

class NametableView {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly imageData: ImageData;

    constructor(private readonly container: HTMLElement) {
        const canvas = container.querySelector('canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
            throw new Error(`Can't get context from canvas`);
        }

        this.ctx = ctx;
        this.imageData = this.ctx.createImageData(canvas.width, canvas.height);
    }

    render(ppu: Ppu): void {
        for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
                // Each byte of the nametable represent a pattern
                const index = y * 32 + x;
                const patternId = ppu.ppuRead(PpuConstants.NAMETABLE_START_ADDR + index);
                this.renderPattern(ppu, patternId, x, y);
            }
        }

        this.ctx.putImageData(this.imageData, 0, 0);
    }

    // TODO reuse in pattern-view
    private renderPattern(ppu: Ppu, patternId: number, tileX: number, tileY: number): void {
        const patternIndex = patternId * 16;
        for (let row = 0; row < 8; row++) {
            const lsbRow = ppu.ppuRead(patternIndex + row);
            const msbRow = ppu.ppuRead(patternIndex + row + 8);
            for (let col = 0; col < 8; col++) {
                const lsb = (lsbRow >> col) & 0x1;
                const msb = (msbRow >> col) & 0x1;
                const pattern = (msb << 1) | lsb;
                const color = this.getColorFromPalette(ppu, 0, pattern);

                const pixel = ((tileY * 8 + row) * 32 * 8 + tileX * 8 + (7 - col)) * 4;
                this.imageData.data[pixel + 0] = color[0];
                this.imageData.data[pixel + 1] = color[1];
                this.imageData.data[pixel + 2] = color[2];
                this.imageData.data[pixel + 3] = 255;
            }
        }
    }

    private getColorFromPalette(ppu: Ppu, palette: number, pixel: number): Color {
        return PPU_PALETTE[ppu.ppuRead(PpuConstants.PALETTE_START_ADDR + (palette * 4) + pixel) & 0x3F];
    }
}

export {NametableView};
