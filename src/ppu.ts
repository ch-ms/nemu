import {Uint8, Uint16} from './types';
import {Device} from './interfaces';
import {Cartridge} from './cartridge';
import {ppuPalette} from './ppu-palette';

const enum PpuConstants {
    CONTROL_REGISTER = 0x0,
    MASK_REGISTER = 0x1,
    STATUS_REGISTER = 0x2,
    OAM_ADDR_REGISTER = 0x3,
    OAM_DATA_REGISTER = 0x4,
    SCROLL_REGISTER = 0x5,
    PPU_ADDR_REGISTER = 0x6,
    PPU_DATA_REGISTER = 0x7,
    CYCLES_PER_SCANLINE = 341,
    FRAME_SCANLINES = 261
}

type Color = [number, number, number];

interface ScreenInterface {
    setPixel(x: number, y: number, color: Color): void;
    frameCompleted(): void;
}

const DEFAULT_SCREEN_INTERFACE: ScreenInterface = {
    setPixel: () => {},
    frameCompleted: () => {}
};

/**
 * Nes Picture Processing Unit
 */
class Ppu implements Device {
    private cycle = 0;
    private scanline = 0;

    constructor(
        private readonly cartridge: Cartridge,
        private readonly screenInterface = DEFAULT_SCREEN_INTERFACE
    ) {
    }

    reset(): void {
        this.cycle = 0;
        this.scanline = 0;
    }

    read(addr: Uint16): Uint8 {
        return this.cpuBusRead(addr);
    }

    write(addr: Uint16, data: Uint8): void {
        return this.cpuBusWrite(addr, data);
    }

    cpuBusRead(addr: Uint16): Uint8 {
        switch (addr) {
            case PpuConstants.CONTROL_REGISTER:
                return 0;

            case PpuConstants.MASK_REGISTER:
                return 0;

            case PpuConstants.STATUS_REGISTER:
                return 0;

            case PpuConstants.OAM_ADDR_REGISTER:
                return 0;

            case PpuConstants.OAM_DATA_REGISTER:
                return 0;

            case PpuConstants.SCROLL_REGISTER:
                return 0;

            case PpuConstants.PPU_ADDR_REGISTER:
                return 0;

            case PpuConstants.PPU_DATA_REGISTER:
                return 0;

            default:
                throw new Error(`Unknown ppu register "0x${addr.toString(16)}"`);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cpuBusWrite(addr: Uint16, data: Uint8): void {
        switch (addr) {
            case PpuConstants.CONTROL_REGISTER:
                break;

            case PpuConstants.MASK_REGISTER:
                break;

            case PpuConstants.STATUS_REGISTER:
                break;

            case PpuConstants.OAM_ADDR_REGISTER:
                break;

            case PpuConstants.OAM_DATA_REGISTER:
                break;

            case PpuConstants.SCROLL_REGISTER:
                break;

            case PpuConstants.PPU_ADDR_REGISTER:
                break;

            case PpuConstants.PPU_DATA_REGISTER:
                break;

            default:
                throw new Error(`Unknown ppu register "0x${addr.toString(16)}"`);
        }
    }

    // https://wiki.nesdev.com/w/index.php/PPU_frame_timing
    clock(): void {
        // TODO debug
        const color = this.scanline % 10 === 0 ?  ppuPalette[0x30] : ppuPalette[0x3F];
        this.screenInterface.setPixel(this.cycle, this.scanline, color);

        this.cycle++;
        if (this.cycle >= PpuConstants.CYCLES_PER_SCANLINE) {
            this.cycle = 0;
            this.scanline++;

            if (this.scanline >= PpuConstants.FRAME_SCANLINES) {
                this.screenInterface.frameCompleted();
                this.scanline = -1;
            }
        }
    }
}

export {
    Ppu,
    ScreenInterface,
    Color
};
