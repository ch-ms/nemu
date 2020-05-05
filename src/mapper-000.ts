import {Uint16} from './numbers';
import {Mapper} from './mapper';
import {CartridgeHeader} from './cartridge-parser';

class Mapper000 implements Mapper {
    private readonly cartridgeHeader: CartridgeHeader;

    constructor(cartridgeHeader: CartridgeHeader) {
        this.cartridgeHeader = cartridgeHeader;
    }

    map(addr: Uint16): Uint16 {
        if (this.cartridgeHeader.prgSize16K === 1 && addr >= 0xc000 && addr < 0x10000) {
            return 0x8000 + addr - 0xc000;
        }

        return addr;
    }

    write(): void {
    }
}

export {Mapper000};
