import {Uint16, Uint8, Numbers} from './numbers';

const enum Offsets {
    COARSE_Y = 5,
    NAMETABLE = 10,
    NAMETABLE_X = Offsets.NAMETABLE,
    NAMETABLE_Y = Offsets.NAMETABLE_X + 1,
    FINE_Y = 12
}

const enum Fields {
    COARSE_X = 0b11111,
    COARSE_Y = 0b11111 << Offsets.COARSE_Y,
    NAMETABLE_X = 0b1 << Offsets.NAMETABLE_X,
    NAMETABLE_Y = 0b1 << Offsets.NAMETABLE_Y,
    NAMETABLE = 0b11 << Offsets.NAMETABLE,
    FINE_Y = 0b111 << Offsets.FINE_Y
}

/**
 * Loopy register is used to maintain PPU state
 * https://wiki.nesdev.com/w/index.php/PPU_scrolling
 */
class LoopyRegister {
    public value: Uint16 = 0;

    setCoarseX(data: Uint8): void {
        this.value = (this.value & ~Fields.COARSE_X) | ((data & 0b11111));
    }

    setCoarseY(data: Uint8): void {
        this.value = (this.value & ~Fields.COARSE_Y) | ((data & 0b11111) << Offsets.COARSE_Y);
    }

    setFineY(data: Uint8): void {
        this.value = (this.value & ~Fields.FINE_Y) | ((data & 0b111) << Offsets.FINE_Y);
    }

    setNametable(data: Uint8): void {
        this.value = (this.value & ~Fields.NAMETABLE) | ((data & 0b11) << Offsets.NAMETABLE);
    }

    flipNametableX(): void {
        const toggleBit = ((this.value & Fields.NAMETABLE_X) ? 0 : 1) << Offsets.NAMETABLE_X;
        this.value = (this.value & ~Fields.NAMETABLE_X) | toggleBit;
    }

    flipNametableY(): void {
        const toggleBit = ((this.value & Fields.NAMETABLE_Y) ? 0 : 1) << Offsets.NAMETABLE_Y;
        this.value = (this.value & ~Fields.NAMETABLE_Y) | toggleBit;
    }

    transferX(source: LoopyRegister): void {
        this.value = (this.value & ~Fields.NAMETABLE_X) | (source.value & Fields.NAMETABLE_X);
        this.value = (this.value & ~Fields.COARSE_X) | (source.value & Fields.COARSE_X);
    }

    transferY(source: LoopyRegister): void {
        this.value = (this.value & ~Fields.NAMETABLE_Y) | (source.value & Fields.NAMETABLE_Y);
        this.value = (this.value & ~Fields.COARSE_Y) | (source.value & Fields.COARSE_Y);
        this.value = (this.value & ~Fields.FINE_Y) | (source.value & Fields.FINE_Y);
    }

    get tileId(): Uint16 {
        return this.value & (Fields.COARSE_X | Fields.COARSE_Y | Fields.NAMETABLE);
    }

    get attribIndex(): Uint16 {
        const x = (this.value & Fields.COARSE_X) >>> 2;
        const y = ((this.value & Fields.COARSE_Y) >>> (Offsets.COARSE_Y + 2)) << 3;
        return (x | y) | (this.value & Fields.NAMETABLE);
    }

    get coarseX(): Uint8 {
        return (this.value & Fields.COARSE_X) & Numbers.UINT8_CAST;
    }

    get coarseY(): Uint8 {
        return ((this.value & Fields.COARSE_Y) >>> Offsets.COARSE_Y) & Numbers.UINT8_CAST;
    }

    get fineY(): Uint8 {
        return ((this.value & Fields.FINE_Y) >>> Offsets.FINE_Y) & Numbers.UINT8_CAST;
    }
}

export {LoopyRegister};
