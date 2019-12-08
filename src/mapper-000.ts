import {Uint16} from './types';
import {Mapper} from './mapper';
import {CartridgeHeader} from './cartridge-parser';

class Mapper000 implements Mapper {
    private readonly cartridgeHeader: CartridgeHeader;

    constructor(cartridgeHeader: CartridgeHeader) {
        this.cartridgeHeader = cartridgeHeader;
    }

    map(addr: Uint16): Uint16 {
        if (addr >= 0xc000 && addr < 0x10000) {
            return addr - 0xc000 + 0x8000;
        }

        return addr;
    }
}

export {Mapper000};
