import {Uint8, Uint16} from './numbers';
import {Device} from './interfaces';
import {createMapper, Mapper} from './mapper';
import {MirroringMode} from './mirroring-mode';
import {
    CartridgeData,
    SerializedCartridgeData,
    serializeCartridgeData,
    deserializeCartridgeData
} from './cartridge-parser';


export interface CartridgeState {
    cartridgeData: Readonly<SerializedCartridgeData>;
}

// TODO RF mb merge with cartridge parser?
/**
 * Game cartridge
 */
class Cartridge implements Device {
    private readonly mapper: Mapper;

    readonly mirroringMode: MirroringMode;

    constructor(private readonly cartridgeData: Readonly<CartridgeData>) {
        this.mapper = createMapper(cartridgeData.header);
        this.mirroringMode = this.cartridgeData.header.mirroring;
    }

    // TODO RF mb read & write for cpu & ppu separately?
    // It will present logic more obviously than addresses
    read(addr: Uint16): Uint8 {
        if (/* addr >= 0 && */ addr < 0x2000) {
            return this.cartridgeData.chrData[this.mapper.map(addr)];
        } else if (addr >= 0x4020 && addr < 0x6000) {
            // TODO read from Expansion ROM
            return 0;
        } else if (/* addr >= 0x6000 && */ addr < 0x8000) {
            // TODO read from SRAM
            return 0;
        } else if (/* addr >= 0x8000 && */ addr < 0x10000) {
            return this.cartridgeData.prgRom[this.mapper.map(addr) - 0x8000];
        }

        throw new Error(`Can't read from addr "${addr}"`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    write(addr: Uint16, data: Uint8): void {
        if (/* addr >= 0x0 && */ addr < 0x2000) {
            this.cartridgeData.chrData[this.mapper.map(addr)] = data;
        } else if (addr >= 0x4020 && addr < 0x6000) {
            // TODO write to Expansion ROM
        } else if (/* addr >= 0x6000 && */ addr < 0x8000) {
            // TODO write to SRAM
        } else if (/* addr >= 0x8000 && */ addr < 0x10000) {
            this.mapper.write(addr, data);
        } else {
            throw new Error(`Can't write to addr "${addr}"`);
        }
    }

    serialize(): CartridgeState {
        return {cartridgeData: serializeCartridgeData(this.cartridgeData)};
    }

    static fromSerializedState(state: CartridgeState): Cartridge {
        return new Cartridge(deserializeCartridgeData(state.cartridgeData));
    }
}

export {Cartridge};
