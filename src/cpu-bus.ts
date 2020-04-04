import {Uint16, Uint8} from './numbers';
import {Bus} from './interfaces';
import {Ppu} from './ppu';
import {Constants} from './constants';
import {Cartridge} from './cartridge';

/**
 * Nes bus
 */
class CpuBus implements Bus {
    private readonly ram = new Uint8Array(2 * Constants.KILOBYTE);

    constructor(
        private readonly cartridge: Cartridge,
        private readonly ppu: Ppu
    ) {
    }

    write(addr: Uint16, data: Uint8): void {
        if (addr >= 0x0 && addr < 0x2000) {
            this.ram[addr % 0x800] = data;
        } else if (addr >= 0x2000 && addr < 0x4000) {
            this.ppu.write(addr % 0x8, data);
        } else if (addr >= 0x4000 && addr < 0x4020) {
            // TODO map to APU
        } else if (addr >= 0x4020 && addr < 0x10000) {
            this.cartridge.write(addr, data);
        } else {
            throw Error(`Can't map addr "${addr}" to device`);
        }
    }

    // TODO mb some mechanism to perform addr mapping?
    read(addr: Uint16): Uint8 {
        if (addr >= 0x0 && addr < 0x2000) {
            return this.ram[addr % 0x800];
        } else if (addr >= 0x2000 && addr < 0x4000) {
            return this.ppu.read(addr % 0x8);
        } else if (addr >= 0x4000 && addr < 0x4020) {
            // TODO map to APU
            return 0;
        } else if (addr >= 0x4020 && addr < 0x10000) {
            return this.cartridge.read(addr);
        }

        throw Error(`Can't map addr "${addr}" to device`);
    }
}

export {CpuBus};
