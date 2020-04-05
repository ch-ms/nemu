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

/**
 * Cartridge contains game data
 */

export interface CartridgeState {
    cartridgeData: Readonly<SerializedCartridgeData>;
}

class Cartridge implements Device {
    private readonly mapper: Mapper;

    readonly mirroringMode: MirroringMode;

    constructor(private readonly cartridgeData: Readonly<CartridgeData>) {
        this.mapper = createMapper(cartridgeData.header);

        this.mirroringMode = this.cartridgeData.header.mirroring;
    }

    read(addr: Uint16): Uint8 {
        const mappedAddr = this.mapper.map(addr);

        if (mappedAddr >= 0x0 && mappedAddr < 0x2000) {
            return this.cartridgeData.chrRom[mappedAddr];
        } else if (mappedAddr >= 0x4020 && mappedAddr < 0x6000) {
            // TODO read from Expansion ROM
            return 0;
        } else if (mappedAddr >= 0x6000 && mappedAddr < 0x8000) {
            return 0;
            // TODO read from SRAM
        } else if (mappedAddr >= 0x8000 && mappedAddr < 0x10000) {
            return this.cartridgeData.prgRom[mappedAddr - 0x8000];
        }

        throw new Error(`Can't read from addr "${addr}"`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    write(addr: Uint16, data: Uint8): void {
        const mappedAddr = this.mapper.map(addr);

        // TODO do we need to write anything?
        if (mappedAddr >= 0x0 && mappedAddr < 0x2000) {
            // TODO write to CHR
        } else if (mappedAddr >= 0x4020 && mappedAddr < 0x6000) {
            // TODO write to Expansion ROM
        } else if (mappedAddr >= 0x6000 && mappedAddr < 0x8000) {
            // TODO write to SRAM
        } else if (mappedAddr >= 0x8000 && mappedAddr < 0x10000) {
            // TODO write to PRG
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
