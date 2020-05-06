import {Mapper} from './mapper';
import {Uint8, Uint16} from './numbers';
import {CartridgeHeader, CartridgeConstants} from './cartridge-parser';

export class Mapper003 implements Mapper {
    private chrBank = 0;

    constructor(private readonly cartridgeHeader: CartridgeHeader) {
    }

    map(addr: Uint16): Uint16 {
        // TODO same as mapper 000
        if (this.cartridgeHeader.prgSize16K === 1 && addr >= 0xc000 && addr < 0x10000) {
            return 0x8000 + addr - 0xc000;
        }

        if (addr < 0x2000) {
            return this.chrBank + addr;
        }

        return addr;
    }

    write(addr: Uint16, data: Uint8): void {
        this.chrBank = (data & 0x3) * CartridgeConstants.CHR_BANK_SIZE;
    }
}
