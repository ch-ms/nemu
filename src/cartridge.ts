import {Uint8, Uint16} from './numbers';
import {Device} from './interfaces';
import {CartridgeData} from './cartridge-parser';
import {createMapper, Mapper} from './mapper';
import {MirroringModes} from './mirroring-modes';

/**
 * Cartridge contains game data
 */

class Cartridge implements Device {
    private readonly mapper: Mapper;

    constructor(private readonly cartridgeData: CartridgeData) {
        this.mapper = createMapper(cartridgeData.header);
    }

    get mirroring(): MirroringModes {
        return this.cartridgeData.header.mirroring;
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
}

export {Cartridge};
