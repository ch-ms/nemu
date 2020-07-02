import {Uint8, Uint16, Numbers} from './numbers';
import {Device} from './interfaces';
import {Cartridge} from './cartridge';
import {PPU_PALETTE} from './ppu-palette';
import {MirroringMode} from './mirroring-mode';
import {Constants} from './constants';
import {LoopyRegister} from './loopy-register';
import {fillUint8Array} from './utils/utils';
import {PALETTE_ADDR_LOOKUP} from './palette-addr-lookup';

export const enum PpuConstants {
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
    FRAME_VISIBLE_SCANLINES = 240,
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
    PPU_SECONDARY_MODE = 1 << 6,
    ENABLE_NMI = 1 << 7
}

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
    frameCompleted(frameBuffer: ImageData): void;
}

const DEFAULT_SCREEN_INTERFACE: ScreenInterface = {
    frameCompleted: () => {}
};

// TODO we need to serialize less data
// TODO serialize apu state
// As a guess: we can serialize data on a -1 scanline (or something with stable state)
// If user can read data it definetly must be serialized
export interface PpuState {
    cycle: number;
    scanline: number;
    nmiRequestFlag: boolean;
    statusRegister: Uint8;
    maskRegister: Uint8;
    controlRegister: Uint8;

    palette: Uint8[];

    nametable0: Uint8[];
    nametable1: Uint8[];
    vram: number;
    tram: number;
    fineX: number;

    oam: Uint8[];
    oamAddr: Uint8;

    dataBuffer: Uint8;
    isAddrHigherByte: boolean;
}

/**
 * Nes Picture Processing Unit
 */
class Ppu implements Device {
    private cycle = 0;
    /** Goes from -1 to PpuConstants.FRAME_SCANLINES */
    private scanline = 0;
    nmiRequestFlag = false;
    private statusRegister: Uint8 = 0x0;

    private controlRegister: Uint8 = 0x0;
    private isSprites8x8 = true;
    private patternTableOffset8x8 = 0;

    private maskRegister: Uint8 = 0x0;
    private isRenderingEnabled = 0;
    private isBackgroundRenderingEnabled = 0;
    private isSpritesRenderingEnabled = 0;

    private palette = new Uint8Array(32);

    // Background stuff
    private readonly nametable0 = new Uint8Array(PpuConstants.NAMETABLE_SIZE);
    private readonly nametable1 = new Uint8Array(PpuConstants.NAMETABLE_SIZE);
    private readonly vram = new LoopyRegister();
    private readonly tram = new LoopyRegister();
    private fineX = 0;

    // Foreground stuff
    readonly oam = new Uint8Array(PpuConstants.OAM_SIZE);
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

    // We compute pixel index with PpuConstants.VISIBLE_SCANLINE_END_CYCLE instead of ImageData.width (which is slow)
    // So be aware of it when change image dimensions
    private frameBuffer = new ImageData(PpuConstants.VISIBLE_SCANLINE_END_CYCLE, PpuConstants.FRAME_VISIBLE_SCANLINES);

    constructor(
        private readonly cartridge: Cartridge,
        private readonly screenInterface = DEFAULT_SCREEN_INTERFACE,
        state?: PpuState
    ) {
        // Fill frame buffer alpha component to make image opaque
        for (let i = 0; i < this.frameBuffer.data.length; i += 4) {
            this.frameBuffer.data[i + 3] = 255;
        }

        if (state) {
            this.cycle = state.cycle;
            this.scanline = state.scanline;
            this.nmiRequestFlag = state.nmiRequestFlag;
            this.statusRegister = state.statusRegister;
            this.setMaskRegister(state.maskRegister);
            this.setControlRegister(state.controlRegister);

            fillUint8Array(this.palette, state.palette);
            fillUint8Array(this.nametable0, state.nametable0);
            fillUint8Array(this.nametable1, state.nametable1);

            this.vram.value = state.vram;
            this.tram.value = state.tram;
            this.fineX = state.fineX;

            fillUint8Array(this.oam, state.oam);
            this.oamAddr = state.oamAddr;

            this.dataBuffer = state.dataBuffer;
            this.isAddrHigherByte = state.isAddrHigherByte;
        }
    }

    reset(): void {
        this.cycle = 0;
        this.scanline = 0;
    }

    /**
     * Read from cpu
     */
    read(addr: Uint16): Uint8 {
        switch (addr) {
            case PpuConstants.CONTROL_REGISTER:
                // Non readable
                return 0;

            case PpuConstants.MASK_REGISTER:
                // Non readable
                return 0;

            case PpuConstants.STATUS_REGISTER: {
                const data = (this.statusRegister & 0b111 << 5) | (this.dataBuffer & 0b11111);
                this.statusRegister &= ~StatusRegister.VERTICAL_BLANK;
                this.isAddrHigherByte = true;
                return data;
            }

            case PpuConstants.OAM_ADDR_REGISTER:
                // Non readable
                return 0;

            case PpuConstants.OAM_DATA_REGISTER:
                return this.oam[this.oamAddr];

            case PpuConstants.SCROLL_REGISTER:
                // Non readable
                return 0;

            case PpuConstants.PPU_ADDR_REGISTER:
                // Non readable
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
        // TODO mb return, not break?
        switch (addr) {
            case PpuConstants.CONTROL_REGISTER:
                this.setControlRegister(data);
                break;

            case PpuConstants.MASK_REGISTER:
                this.setMaskRegister(data);
                break;

            case PpuConstants.STATUS_REGISTER:
                // Non writeable
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

        if (addr < PpuConstants.NAMETABLE_START_ADDR) {
            return this.cartridge.read(addr);
        } else if (addr < PpuConstants.PALETTE_START_ADDR) {
            const {nametable, index} = this.mirrorNametable(addr);
            return nametable[index];
        } else /* addr >= PpuConstants.PALETTE_START_ADDR && addr < 0x4000 */ {
            return this.palette[PALETTE_ADDR_LOOKUP[addr - PpuConstants.PALETTE_START_ADDR]];
        }
    }

    ppuWrite(addr: Uint16, data: Uint8): void {
        addr %= 0x4000;

        if (addr < PpuConstants.NAMETABLE_START_ADDR) {
            this.cartridge.write(addr, data);
            return;
        } else if (addr < PpuConstants.PALETTE_START_ADDR) {
            const {nametable, index} = this.mirrorNametable(addr);
            nametable[index] = data;
            return;
        } else /* addr >= PpuConstants.PALETTE_START_ADDR && addr < 0x4000 */ {
            this.palette[PALETTE_ADDR_LOOKUP[addr - PpuConstants.PALETTE_START_ADDR]] = data;
            return;
        }
    }

    /**
     * @see {@link https://wiki.nesdev.com/w/index.php/PPU_frame_timing}
     */
    clock(): void {
        // Step: Advance background rendering pipeline
        if (this.scanline < PpuConstants.FRAME_VISIBLE_SCANLINES) {
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
                        if (this.isRenderingEnabled) {
                            this.vram.incrementScrollX();
                        }
                        break;
                    }
                }
            }

            if (this.isRenderingEnabled && this.cycle === 256) {
                this.vram.incrementScrollY();
            }

            if (this.cycle === 257) {
                this.loadBgShifters();
                if (this.isRenderingEnabled) {
                    this.vram.transferX(this.tram);
                }
            }

            if (this.cycle === 340) {
                this.bgNextTileId = this.ppuRead(PpuConstants.NAMETABLE_START_ADDR + this.vram.tileId);
            }

            if (this.scanline === -1 && this.cycle >= 280 && this.cycle < 305) {
                if (this.isRenderingEnabled) {
                    this.vram.transferY(this.tram);
                }
            }
        }

        // Step: evaluate sprites for next scanline
        if (this.scanline !== -1 && this.cycle === PpuConstants.VISIBLE_SCANLINE_END_CYCLE) {
            this.scanlineSpritesIndexes = [];
            const spritesHeight = this.isSprites8x8 ? 8 : 16;
            // Eval which sprites are visible on the next scanline
            for (let i = 0; i < PpuConstants.OAM_ENTRIES; i++) {
                const index = i * PpuConstants.OAM_ENTRY_SIZE;
                const yOffset = this.scanline - this.oam[index + PpuConstants.OAM_ENTRY_Y];
                if (yOffset >= 0 && yOffset < spritesHeight) {
                    if (this.scanlineSpritesIndexes.length === PpuConstants.MAX_SPRITES_PER_SCANLINE) {
                        // Sprite overflow flag has different behaviour, we simplify this a litle bit
                        this.statusRegister |= StatusRegister.SPRITE_OVERFLOW;
                        break;
                    }

                    this.scanlineSpritesIndexes.push(index);
                }
            }
        }

        // Step: resolve background pixel
        let bgPixel = 0;
        let bgPalette = 0;
        if (this.isBackgroundRenderingEnabled) {
            // Offset to a proper pixel in buffer
            // TODO PERF can precompute this on scroll register set
            const offset = 0x8000 >>> this.fineX;

            const pixelLsb = (this.bgShifterPatternLsb & offset) && 1;
            const pixelMsb = (this.bgShifterPatternMsb & offset) && 1;
            bgPixel = (pixelMsb << 1) | pixelLsb;

            const paletteLsb = (this.bgShifterAttribLo & offset) && 1;
            const paletteMsb = (this.bgShifterAttribHi & offset) && 1;
            bgPalette = (paletteMsb << 1) | paletteLsb;
        }

        // Step: resolve foreground pixel
        let fgPixel = 0;
        let fgPalette = 0;
        let bgPriority = 0;
        let spriteZeroRendered = false;
        if (this.isSpritesRenderingEnabled && this.cycle < PpuConstants.VISIBLE_SCANLINE_END_CYCLE) {
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

                    let patternTableOffset, tilePart, tileOffset;
                    if (this.isSprites8x8) {
                        patternTableOffset = this.patternTableOffset8x8;
                        tilePart = 0;
                        tileOffset = tileId;
                    } else {
                        patternTableOffset = (tileId & Constants.BIT_1) << 12;
                        tilePart = yOffset < 8 ? (flipY ? 1 : 0) : (flipY ? 0 : 1);
                        tileOffset = tileId & 0b11111110;
                    }

                    const addrLo = (
                        patternTableOffset +
                        ((tileOffset + tilePart) * 16) +
                        // offset into part of sprite can't be more than 7
                        // so bring it back with & 0x7
                        (flipY ? 7 - yOffset & 0x7: yOffset & 0x7)
                    ) & Numbers.UINT16_CAST;

                    // TODO ppu read is slow, mb need to buffer this data
                    const spriteLo = this.ppuRead(addrLo);
                    const spriteHi = this.ppuRead(addrLo + 8);

                    const flipX = attr & OamAttribute.FLIP_X;
                    const bitOffset = 1 << (flipX ? xOffset : (7 - xOffset));
                    const pixelLo = (spriteLo & bitOffset) && 1;
                    const pixelHi = (spriteHi & bitOffset) && 1;
                    const pixel = (pixelHi << 1) | pixelLo;

                    // If pixel is not transparent we can render it
                    // Since we have sprites arranged by priority we do not need to check other sprites
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

        // Step: resolve final pixel
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

        // Step: compute sprite zero hit
        if (
            bgFgBothRendered &&
            spriteZeroRendered &&
            this.isBackgroundRenderingEnabled &&
            this.isSpritesRenderingEnabled
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

        // Step: send pixel to the frame buffer
        if (
            this.cycle < PpuConstants.VISIBLE_SCANLINE_END_CYCLE &&
            this.scanline < PpuConstants.FRAME_VISIBLE_SCANLINES
        ) {
            const color = PPU_PALETTE[this.ppuRead(PpuConstants.PALETTE_START_ADDR + (palette * 4) + pixel) & 0x3F];
            // frameBuffer.width is slow, so we use width it created with to compute index
            // TODO can precompute index with scanline
            const index = (this.scanline * PpuConstants.VISIBLE_SCANLINE_END_CYCLE + this.cycle) * 4;
            this.frameBuffer.data[index] = color[0];
            this.frameBuffer.data[index + 1] = color[1];
            this.frameBuffer.data[index + 2] = color[2];
        }

        if (this.cycle === 1) {
            // Step: reset status register
            if (this.scanline === -1) {
                this.statusRegister = 0;
            }

            // Step: vertical blank & nmi
            if (this.scanline === 241) {
                this.statusRegister |= StatusRegister.VERTICAL_BLANK;
                this.nmiRequestFlag = Boolean(this.controlRegister & ControlRegister.ENABLE_NMI);
            }
        }

        // Step: advance cycles
        this.cycle++;
        if (this.cycle >= PpuConstants.CYCLES_PER_SCANLINE) {
            this.cycle = 0;
            this.scanline++;

            if (this.scanline >= PpuConstants.FRAME_SCANLINES) {
                this.screenInterface.frameCompleted(this.frameBuffer);
                this.scanline = -1;
            }
        }
    }

    serialize(): PpuState {
        return {
            cycle: this.cycle,
            scanline: this.scanline,
            nmiRequestFlag: this.nmiRequestFlag,
            statusRegister: this.statusRegister,
            maskRegister: this.maskRegister,
            controlRegister: this.controlRegister,

            palette: Array.from(this.palette.values()),

            nametable0: Array.from(this.nametable0.values()),
            nametable1: Array.from(this.nametable1.values()),
            vram: this.vram.value,
            tram: this.tram.value,
            fineX: this.fineX,

            oam: Array.from(this.oam.values()),
            oamAddr: this.oamAddr,

            dataBuffer: this.dataBuffer,
            isAddrHigherByte: this.isAddrHigherByte
        };
    }

    /**
     * Sets mask register and cache some flags combination
     */
    private setMaskRegister(value: Uint8): void {
        this.maskRegister = value;
        this.isRenderingEnabled = this.maskRegister & (MaskRegister.RENDER_BACKGROUND | MaskRegister.RENDER_SPRITES);
        this.isBackgroundRenderingEnabled = this.maskRegister & MaskRegister.RENDER_BACKGROUND;
        this.isSpritesRenderingEnabled = this.maskRegister & MaskRegister.RENDER_SPRITES;
    }

    /**
     * Sets control register and cache some flags combination
     */
    private setControlRegister(value: Uint8): void {
        this.controlRegister = value;
        this.tram.setNametable(value);
        this.isSprites8x8 = !(this.controlRegister & ControlRegister.SPRITE_SIZE);
        this.patternTableOffset8x8 = (this.controlRegister & ControlRegister.PATTERN_SPRITE) << 9;
    }

    // TODO optimize this somehow
    private mirrorNametable(addr: Uint16): {nametable: Uint8Array, index: number} {
        // TODO we can do it once in a cartridge
        if (
            this.cartridge.mirroringMode !== MirroringMode.HORIZONTAL &&
            this.cartridge.mirroringMode !== MirroringMode.VERTICAL
        ) {
            const msg = `Only horizontal and vertical mirroring modes are supported, got ${this.cartridge.mirroringMode}`;
            throw new Error(msg);
        }

        // TODO there is no need to expose index, we can compute it in caller
        const index = addr % PpuConstants.NAMETABLE_SIZE;
        // TODO can precompute
        const isHorizontal = this.cartridge.mirroringMode === MirroringMode.HORIZONTAL;
        if (addr < 0x2400) {
            return {nametable: this.nametable0, index};
        } else if (/* addr >= 0x2400 && */ addr < 0x2800) {
            return {nametable: isHorizontal ? this.nametable0 : this.nametable1, index};
        } else if (/* addr >= 0x2800 && */ addr < 0x2c00) {
            return {nametable: isHorizontal ? this.nametable1 : this.nametable0, index};
        } else /* addr >= 0x2c00 && addr < 0x3000 */ {
            return {nametable: isHorizontal ? this.nametable0 : this.nametable1, index};
        }
    }

    private incrementVram(): void {
        // TODO PERF precompute
        const increment = (this.controlRegister & ControlRegister.INCREMENT_MODE) ? 32 : 1;
        // TODO PERF move to loopy or inline
        this.vram.value = (this.vram.value + increment) & Numbers.UINT16_CAST;
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
}

export {
    Ppu,
    ScreenInterface
};
