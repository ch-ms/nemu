import {Ppu, PpuConstants} from '../ppu';
import {ppuPalette} from '../ppu-palette';
import {ColorQuad, stringifyColor} from '../color';

class PaletteEntry {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly cellWidth: number;
    private readonly cellHeight: number;

    constructor(canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
            throw new Error('Cant get context from canvas');
        }

        this.ctx = ctx;
        this.cellWidth = canvas.width / 4;
        this.cellHeight = canvas.height;
    }

    render(colors: ColorQuad): void {
        for (let i = 0; i < 4; i++) {
            const color = colors[i];
            // TODO can do it with imageData
            this.ctx.fillStyle = stringifyColor(color);
            this.ctx.fillRect(this.cellWidth * i, 0, this.cellWidth, this.cellHeight);
        }
    }
}

class PaletteView {
    private readonly paletteEntries: [PaletteEntry, PaletteEntry, PaletteEntry, PaletteEntry,
        PaletteEntry, PaletteEntry, PaletteEntry, PaletteEntry];

    constructor(private readonly container: HTMLElement) {
        this.paletteEntries = [
            new PaletteEntry(container.querySelector(`[data-palette="0"]`) as HTMLCanvasElement),
            new PaletteEntry(container.querySelector(`[data-palette="1"]`) as HTMLCanvasElement),
            new PaletteEntry(container.querySelector(`[data-palette="2"]`) as HTMLCanvasElement),
            new PaletteEntry(container.querySelector(`[data-palette="3"]`) as HTMLCanvasElement),
            new PaletteEntry(container.querySelector(`[data-palette="4"]`) as HTMLCanvasElement),
            new PaletteEntry(container.querySelector(`[data-palette="5"]`) as HTMLCanvasElement),
            new PaletteEntry(container.querySelector(`[data-palette="6"]`) as HTMLCanvasElement),
            new PaletteEntry(container.querySelector(`[data-palette="7"]`) as HTMLCanvasElement)
        ];
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    render(ppu: Ppu): void {
        for (let palette = 0; palette < 8; palette++) {
            const addr = PpuConstants.PALETTE_START_ADDR + palette * 4;
            const colors: ColorQuad = [
                ppuPalette[ppu.ppuRead(addr + 0)],
                ppuPalette[ppu.ppuRead(addr + 1)],
                ppuPalette[ppu.ppuRead(addr + 2)],
                ppuPalette[ppu.ppuRead(addr + 3)],
            ];
            this.paletteEntries[palette].render(colors);
        }
    }
}

export {PaletteView};
