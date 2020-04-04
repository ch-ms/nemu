import {Uint8, Uint16, Numbers} from './numbers';
import {Device} from './interfaces';
import {Cartridge} from './cartridge';
import {ppuPalette} from './ppu-palette';
import {Color} from './color';
import {MirroringMode} from './mirroring-mode';
import {Constants} from './constants';
import {LoopyRegister} from './loopy-register';

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
    VISIBLE_SCANLINE_END_CYCLE = 257,
    FRAME_SCANLINES = 261,
    PALETTE_START_ADDR = 0x3f00,
    NAMETABLE_START_ADDR = 0x2000,
    TILE_ATTRIB_START_ADDR = 0x23c0,
    NAMETABLE_SIZE = Constants.KILOBYTE,
    // TODO Separate const for OAM
    OAM_SIZE = 256,
    OAM_ENTRY_SIZE = 4,
    OAM_ENTRIES = PpuConstants.OAM_SIZE / OAM_ENTRY_SIZE,
    OAM_ENTRY_Y = 0,
    OAM_ENTRY_TILE_ID = 1,
    OAM_ENTRY_ATTR = 2,
    OAM_ENTRY_X = 3,
    MAX_SPRITES_PER_SCANLINE = 8,
    SPRITE_WIDTH = 8,
    SPRITES_PALETTE_OFFSET = 4
}

const enum ControlRegister {
    NAMETABLE_X = 1 << 0,
    NAMETABLE_Y = 1 << 1,
    INCREMENT_MODE = 1 << 2,
    PATTERN_SPRITE = 1 << 3,
    PATTERN_BACKGROUND = 1 << 4,
    SPRITE_SIZE = 1 << 5,
    PPU_SLAVE_MODE = 1 << 6,
    ENABLE_NMI = 1 << 7
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const enum MaskRegister {
    GRAYSCALE = 1 << 0,
    RENDER_BACKGROUND_LEFT = 1 << 1,
    RENDER_SPRITES_LEFT = 1 << 2,
    RENDER_BACKGROUND = 1 << 3,
    RENDER_SPRITES = 1 << 4,
    ENHANCE_RED = 1 << 5,
    ENHANCE_GREEN = 1 << 6,
    ENHANCE_BLUE = 1 << 7
}

const enum StatusRegister {
    SPRITE_OVERFLOW = 1 << 5,
    SPRITE_ZERO_HIT = 1 << 6,
    VERTICAL_BLANK = 1 << 7
}

const enum BackgroundPipeline {
    READ_NAMETABLE = 0,
    READ_ATTRIB = 2,
    READ_PATTERN_LSB = 4,
    READ_PATTERN_MSB = 6,
    INCREMENT_SCROLL_X = 7
}

const enum OamAttribute {
    PALETTE = 0b11,
    UNIMPLEMENTED = 0b111 << 2,
    BACKGROUND_PRIORITY = 1 << 5,
    FLIP_X = 1 << 6,
    FLIP_Y = 1 << 7
}

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
    private nmiFlag = false;
    private statusRegister: Uint8 = 0x0;
    private maskRegister: Uint8 = 0x0;
    private controlRegister: Uint8 = 0x0;

    private palette = new Uint8Array(32);

    // Background stuff
    private readonly nametable0 = new Uint8Array(PpuConstants.NAMETABLE_SIZE);
    private readonly nametable1 = new Uint8Array(PpuConstants.NAMETABLE_SIZE);
    private readonly vram = new LoopyRegister();
    private readonly tram = new LoopyRegister();
    private fineX = 0;

    // Foreground stuff
    private readonly oam = new Uint8Array(PpuConstants.OAM_SIZE);
    private oamAddr: Uint8 = 0;
    private scanlineSpritesIndexes: number[] = [];

    // PPU state
    private dataBuffer = 0x0;
    private isAddrHigherByte = true;

    // Background rendering pipeline
    private bgNextTileId: Uint8 = 0;
    private bgNextTileAttrib: Uint8 = 0;
    private bgNextTileLsb: Uint8 = 0;
    private bgNextTileMsb: Uint8 = 0;
    private bgShifterPatternLsb: Uint16 = 0;
    private bgShifterPatternMsb: Uint16 = 0;
    private bgShifterAttribLo: Uint16 = 0;
    private bgShifterAttribHi: Uint16 = 0;

    constructor(
        private readonly cartridge: Cartridge,
        private readonly screenInterface = DEFAULT_SCREEN_INTERFACE
    ) {
    }

    reset(): void {
        this.cycle = 0;
        this.scanline = 0;
    }

    get isNmiRequested(): boolean {
        return this.nmiFlag;
    }

    clearNmiFlag(): void {
        this.nmiFlag = false;
    }

    /**
     * Read from cpu
     */
    read(addr: Uint16): Uint8 {
        switch (addr) {
            case PpuConstants.CONTROL_REGISTER:
                return 0;

            case PpuConstants.MASK_REGISTER:
                return 0;

            case PpuConstants.STATUS_REGISTER: {
                const data = (this.statusRegister & 0b111 << 5) | (this.dataBuffer & 0b11111);
                this.statusRegister &= ~StatusRegister.VERTICAL_BLANK;
                this.isAddrHigherByte = true;
                return data;
            }

            case PpuConstants.OAM_ADDR_REGISTER:
                // Not readable
                return 0;

            case PpuConstants.OAM_DATA_REGISTER:
                return this.oam[this.oamAddr];

            case PpuConstants.SCROLL_REGISTER:
                return 0;

            case PpuConstants.PPU_ADDR_REGISTER:
                // Can't read from PPU_ADDR_REGISTER
                return 0;

            case PpuConstants.PPU_DATA_REGISTER: {
                // Ppu read is delayed by one cycle
                let data = this.dataBuffer;
                this.dataBuffer = this.ppuRead(this.vram.value);

                // But for palettes we get an instant read
                if (this.vram.value > PpuConstants.PALETTE_START_ADDR) {
                    data = this.dataBuffer;
                }

                this.incrementVram();
                return data;
            }

            default:
                throw new Error(`Unknown ppu register "0x${addr.toString(16)}"`);
        }
    }

    /**
     * Write from cpu
     */
    write(addr: Uint16, data: Uint8): void {
        switch (addr) {
            case PpuConstants.CONTROL_REGISTER:
                this.controlRegister = data;
                this.tram.setNametable(data);
                break;

            case PpuConstants.MASK_REGISTER:
                this.maskRegister = data;
                break;

            case PpuConstants.STATUS_REGISTER:
                // Can't write to status register
                break;

            case PpuConstants.OAM_ADDR_REGISTER:
                this.oamAddr = data;
                break;

            case PpuConstants.OAM_DATA_REGISTER:
                this.oam[this.oamAddr] = data;
                break;

            case PpuConstants.SCROLL_REGISTER:
                if (this.isAddrHigherByte) {
                    this.isAddrHigherByte = false;

                    this.tram.setCoarseX(data >>> 3);
                    this.fineX = data & 0b111;
                } else {
                    this.isAddrHigherByte = true;

                    this.tram.setCoarseY(data >>> 3);
                    this.tram.setFineY(data);
                }
                break;

            case PpuConstants.PPU_ADDR_REGISTER:
                if (this.isAddrHigherByte) {
                    this.isAddrHigherByte = false;

                    this.tram.value = (this.tram.value & 0xff) | (data << 8);
                } else {
                    this.isAddrHigherByte = true;

                    this.tram.value = (this.tram.value & 0xff00) | data;
                    this.vram.value = this.tram.value;
                }
                break;

            case PpuConstants.PPU_DATA_REGISTER: {
                this.ppuWrite(this.vram.value, data);
                this.incrementVram();
                break;
            }

            default:
                throw new Error(`Unknown ppu register "0x${addr.toString(16)}"`);
        }
    }

    ppuRead(addr: Uint16): Uint8 {
        addr %= 0x4000;

        if (addr >= 0 && addr < PpuConstants.NAMETABLE_START_ADDR) {
            return this.cartridge.read(addr);
        } else if (addr >= PpuConstants.NAMETABLE_START_ADDR && addr < PpuConstants.PALETTE_START_ADDR) {
            const {nametable, index} = this.mirrorNametable(addr);
            return nametable[index];
        } else /* addr >= PpuConstants.PALETTE_START_ADDR && addr < 0x4000 */ {
            return this.palette[this.mirrorPaletteAddr(addr)];
        }
    }

    ppuWrite(addr: Uint16, data: Uint8): void {
        addr %= 0x4000;

        if (addr >= 0 && addr < PpuConstants.NAMETABLE_START_ADDR) {
            // TODO write to pattern table
        } else if (addr >= PpuConstants.NAMETABLE_START_ADDR && addr < PpuConstants.PALETTE_START_ADDR) {
            const {nametable, index} = this.mirrorNametable(addr);
            nametable[index] = data;
        } else /* addr >= PpuConstants.PALETTE_START_ADDR && addr < 0x4000 */ {
            this.palette[this.mirrorPaletteAddr(addr)] = data;
        }
    }

    // https://wiki.nesdev.com/w/index.php/PPU_frame_timing
    clock(): void {
        // Background rendering
        if (this.scanline >= -1 && this.scanline < 240) {
            // TODO odd frame cycle skip


            if ((this.cycle >= 2 && this.cycle < 258) || (this.cycle >= 321 && this.cycle < 338)) {
                this.updateBgShifters();

                // Rendering pipeline
                // TODO mb we can read all in one call?
                switch ((this.cycle - 1) % 8) {
                    case BackgroundPipeline.READ_NAMETABLE: {
                        this.loadBgShifters();

                        this.bgNextTileId = this.ppuRead(PpuConstants.NAMETABLE_START_ADDR + this.vram.tileId);
                        break;
                    }

                    case BackgroundPipeline.READ_ATTRIB: {
                        let a = this.ppuRead(PpuConstants.TILE_ATTRIB_START_ADDR + this.vram.attribIndex);

                        if (this.vram.coarseY % 4 >= 2) {
                            a = a >>> 4;
                        }
                        if (this.vram.coarseX % 4 >= 2) {
                            a = a >>> 2;
                        }

                        this.bgNextTileAttrib = a & 0b11;
                        break;
                    }

                    case BackgroundPipeline.READ_PATTERN_LSB: {
                        const addr: Uint16 = (
                            ((this.controlRegister & ControlRegister.PATTERN_BACKGROUND) << 8) +
                            // Tile id is multiplied by 16 since each tile is comprised from
                            // 16 bytes
                            (this.bgNextTileId << 4) +
                            (this.vram.fineY)
                        );
                        this.bgNextTileLsb = this.ppuRead(addr);
                        break;
                    }

                    case BackgroundPipeline.READ_PATTERN_MSB: {
                        const addr: Uint16 = (
                            ((this.controlRegister & ControlRegister.PATTERN_BACKGROUND) << 8) +
                            (this.bgNextTileId << 4) +
                            (this.vram.fineY) + 8
                        );
                        this.bgNextTileMsb = this.ppuRead(addr);
                        break;
                    }

                    case BackgroundPipeline.INCREMENT_SCROLL_X: {
                        this.incrementScrollX();
                        break;
                    }
                }
            }

            if (this.cycle === 256) {
                this.incrementScrollY();
            }

            if (this.cycle === 257) {
                this.loadBgShifters();
                if (this.isRenderingEnabled) {
                    this.vram.transferX(this.tram);
                }
            }

            if (this.cycle === 338 || this.cycle === 340) {
                this.bgNextTileId = this.ppuRead(PpuConstants.NAMETABLE_START_ADDR + this.vram.tileId);
            }

            if (this.scanline === -1 && this.cycle >= 280 && this.cycle < 305) {
                if (this.isRenderingEnabled) {
                    this.vram.transferY(this.tram);
                }
            }
        }

        // Sprites evaluation
        const spriteHeight = (this.controlRegister & ControlRegister.SPRITE_SIZE) ? 16 : 8;
        if (this.scanline !== -1 && this.cycle === PpuConstants.VISIBLE_SCANLINE_END_CYCLE) {
            this.scanlineSpritesIndexes = [];
            // Eval which sprites are visible on the next scanline
            for (let i = 0; i < PpuConstants.OAM_ENTRIES; i++) {
                const index = i * PpuConstants.OAM_ENTRY_SIZE;
                const yOffset = this.scanline - this.oam[index + PpuConstants.OAM_ENTRY_Y];
                if (yOffset >= 0 && yOffset < spriteHeight) {
                    if (this.scanlineSpritesIndexes.length === PpuConstants.MAX_SPRITES_PER_SCANLINE) {
                        // Sprite overflow flag has different behaviour, we simplify this a litle bit
                        this.statusRegister |= StatusRegister.SPRITE_OVERFLOW;
                        break;
                    }

                    this.scanlineSpritesIndexes.push(index);
                }
            }
        }

        if (this.scanline === -1 && this.cycle === 1) {
            // TODO merge all assignment into one
            this.statusRegister = (this.statusRegister & ~StatusRegister.SPRITE_ZERO_HIT) & Numbers.UINT8_CAST;
            this.statusRegister = (this.statusRegister & ~StatusRegister.VERTICAL_BLANK) & Numbers.UINT8_CAST;
            this.statusRegister = (this.statusRegister & ~StatusRegister.SPRITE_OVERFLOW) & Numbers.UINT8_CAST;
        } else if (this.scanline === 241 && this.cycle === 1) {
            this.statusRegister |= StatusRegister.VERTICAL_BLANK;
            this.nmiFlag = Boolean(this.controlRegister & ControlRegister.ENABLE_NMI);
        }

        let bgPixel = 0;
        let bgPalette = 0;
        if (this.maskRegister & MaskRegister.RENDER_BACKGROUND) {
            // Offset to a proper pixel in buffer
            const offset = 0x8000 >>> this.fineX;

            const pixelLsb = (this.bgShifterPatternLsb & offset) && 1;
            const pixelMsb = (this.bgShifterPatternMsb & offset) && 1;
            bgPixel = (pixelMsb << 1) | pixelLsb;


            const paletteLsb = (this.bgShifterAttribLo & offset) && 1;
            const paletteMsb = (this.bgShifterAttribHi & offset) && 1;
            bgPalette = (paletteMsb << 1) | paletteLsb;
        }

        let fgPixel = 0;
        let fgPalette = 0;
        let bgPriority = 0;
        let spriteZeroRendered = false;
        if (this.maskRegister & MaskRegister.RENDER_SPRITES && this.cycle < PpuConstants.VISIBLE_SCANLINE_END_CYCLE) {
            for (let i = 0; i < this.scanlineSpritesIndexes.length; i++) {
                const index = this.scanlineSpritesIndexes[i];
                const x = this.oam[index + PpuConstants.OAM_ENTRY_X];
                const xOffset = this.cycle - x;
                if (xOffset >= 0 && xOffset < PpuConstants.SPRITE_WIDTH) {
                    const attr = this.oam[index + PpuConstants.OAM_ENTRY_ATTR];
                    const flipY = attr & OamAttribute.FLIP_Y;
                    // Since we collected sprites on the previous scanline we subtract one
                    // TODO clarify this
                    const yOffset = this.scanline - 1 - this.oam[index + PpuConstants.OAM_ENTRY_Y];
                    const tileId = this.oam[index + PpuConstants.OAM_ENTRY_TILE_ID];

                    const patternTableOffset = spriteHeight === 8 ?
                        (this.controlRegister & ControlRegister.PATTERN_SPRITE) << 9 :
                        (tileId & 0b1);
                    const tilePart = spriteHeight === 8 ? 0 : (
                        yOffset < 8 ? (flipY ? 1 : 0) : (flipY ? 0 : 1)
                    );
                    const tileOffset = spriteHeight === 8 ? tileId : tileId & 0b11111110;
                    const addrLo = (
                        patternTableOffset +
                        ((tileOffset + tilePart) * 16) +
                        (flipY ? 7 - yOffset: yOffset)
                    );

                    // TODO ppu read is slow, mb need to buffer this data
                    const spriteLo = this.ppuRead(addrLo);
                    const spriteHi = this.ppuRead(addrLo + 8);

                    const flipX = attr & OamAttribute.FLIP_X;
                    const bitOffset = 1 << (flipX ? xOffset : (7 - xOffset));
                    const pixelLo = (spriteLo & bitOffset) && 1;
                    const pixelHi = (spriteHi & bitOffset) && 1;
                    const pixel = (pixelHi << 1) | pixelLo;

                    //// If pixel is not transparent we can render it
                    //// Since we have sprites arranged by priority we do not need to check other sprites
                    if (pixel !== 0) {
                        spriteZeroRendered = index === 0;
                        fgPixel = pixel;
                        fgPalette = (attr & OamAttribute.PALETTE) + PpuConstants.SPRITES_PALETTE_OFFSET;
                        bgPriority = attr & OamAttribute.BACKGROUND_PRIORITY;
                        break;
                    }
                }
            }
        }

        // Resolve final pixel
        const bgFgBothRendered = bgPixel !== 0 && fgPixel !== 0;
        let pixel = 0;
        let palette = 0;
        if (bgPixel === 0 && fgPixel === 0) {
            pixel = 0;
            palette = 0;
        } else if (
            (bgPixel === 0 && fgPixel !== 0) ||
            (bgFgBothRendered && !bgPriority)
        ) {
            pixel = fgPixel;
            palette = fgPalette;
        } else {
            pixel = bgPixel;
            palette = bgPalette;
        }

        if (
            bgFgBothRendered &&
            spriteZeroRendered &&
            (this.maskRegister & MaskRegister.RENDER_BACKGROUND) &&
            (this.maskRegister & MaskRegister.RENDER_SPRITES)
        ) {
            if ((this.maskRegister & MaskRegister.RENDER_BACKGROUND_LEFT) && (this.maskRegister & MaskRegister.RENDER_SPRITES)) {
                if (this.cycle >= 1 && this.cycle < 258) {
                    this.statusRegister |= StatusRegister.SPRITE_ZERO_HIT
                }
            } else {
                if (this.cycle >= 9 && this.cycle < 258) {
                    this.statusRegister |= StatusRegister.SPRITE_ZERO_HIT
                }
            }
        }

        const color = ppuPalette[this.ppuRead(PpuConstants.PALETTE_START_ADDR + (palette * 4) + pixel) & 0x3F];
        this.screenInterface.setPixel(this.cycle, this.scanline, color);

        // Advance cycles
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

    /**
     * Write to oam directly
     * Used in oam dma
     */
    writeOam(addr: Uint8, data: Uint8): void {
        this.oam[addr] = data;
    }

    readOam(addr: Uint8): Uint8 {
        return this.oam[addr];
    }

    private mirrorPaletteAddr(addr: Uint16): Uint16 {
        addr %= this.palette.length;
        // https://wiki.nesdev.com/w/index.php/PPU_palettes
        switch (addr) {
            case 0x10:
                return 0x0;

            case 0x14:
                return 0x4;

            case 0x18:
                return 0x8;

            case 0x1c:
                return 0xc;

            default:
                return addr;
        }
    }

    private mirrorNametable(addr: Uint16): {nametable: Uint8Array, index: number} {
        if (
            this.cartridge.mirroringMode !== MirroringMode.HORIZONTAL &&
            this.cartridge.mirroringMode !== MirroringMode.VERTICAL
        ) {
            const msg = `Only horizontal and vertical mirroring modes are supported, got ${this.cartridge.mirroringMode}`;
            throw new Error(msg);
        }

        addr %= 0x3000;
        const index = addr % PpuConstants.NAMETABLE_SIZE;
        const isHorizontal = this.cartridge.mirroringMode === MirroringMode.HORIZONTAL;
        if (addr < 0x2400) {
            return {nametable: this.nametable0, index};
        } else if (addr >= 0x2400 && addr < 0x2800) {
            return {nametable: isHorizontal ? this.nametable0 : this.nametable1, index};
        } else if (addr >= 0x2800 && addr < 0x2c00) {
            return {nametable: isHorizontal ? this.nametable1 : this.nametable0, index};
        } else /* addr >= 0x2c00 && addr < 0x3000 */ {
            return {nametable: isHorizontal ? this.nametable1 : this.nametable0, index};
        }
    }

    private incrementVram(): void {
        const increment = (this.controlRegister & ControlRegister.INCREMENT_MODE) ? 32 : 1;
        this.vram.value = (this.vram.value + increment) & Numbers.UINT16_CAST;
    }

    private get isRenderingEnabled(): boolean {
        return Boolean(this.maskRegister & (MaskRegister.RENDER_BACKGROUND | MaskRegister.RENDER_SPRITES));
    }

    private updateBgShifters(): void {
        this.bgShifterPatternLsb = (this.bgShifterPatternLsb << 1) & Numbers.UINT16_CAST;
        this.bgShifterPatternMsb = (this.bgShifterPatternMsb << 1) & Numbers.UINT16_CAST;
        this.bgShifterAttribLo = (this.bgShifterAttribLo << 1) & Numbers.UINT16_CAST;
        this.bgShifterAttribHi = (this.bgShifterAttribHi << 1) & Numbers.UINT16_CAST;
    }

    private loadBgShifters(): void {
        this.bgShifterPatternLsb = (this.bgShifterPatternLsb & 0xff00) | this.bgNextTileLsb;
        this.bgShifterPatternMsb = (this.bgShifterPatternMsb & 0xff00) | this.bgNextTileMsb;

        // We need to explode attrib value to 8 bit
        this.bgShifterAttribLo = (this.bgShifterAttribLo & 0xff00) | (this.bgNextTileAttrib & 0b1 ? 0xff : 0);
        this.bgShifterAttribHi = (this.bgShifterAttribHi & 0xff00) | (this.bgNextTileAttrib & 0b10 ? 0xff : 0);
    }

    private incrementScrollX(): void {
        if (!this.isRenderingEnabled) {
            return;
        }

        if (this.vram.coarseX == 31) {
            this.vram.setCoarseX(0);
            this.vram.flipNametableX();
        } else {
            this.vram.setCoarseX(this.vram.coarseX + 1);
        }
    }

    private incrementScrollY(): void {
        if (!this.isRenderingEnabled) {
            return;
        }

        if (this.vram.fineY < 7) {
            this.vram.setFineY(this.vram.fineY + 1);
        } else {
            this.vram.setFineY(0);

            if (this.vram.coarseY === 29) {
                this.vram.setCoarseY(0);
                this.vram.flipNametableY();
            } else if (this.vram.coarseY === 31) {
                this.vram.setCoarseY(0);
            } else {
                this.vram.setCoarseY(this.vram.coarseY + 1);
            }
        }
    }
}

export {
    Ppu,
    PpuConstants,
    ScreenInterface
};
