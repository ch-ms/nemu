import {Mapper} from './mapper';
import {Uint8, Uint16} from './numbers';
import {Constants} from './constants';
import {CartridgeHeader} from './cartridge-parser';

export class Mapper002 implements Mapper {
    private mapperLo = 0;
    private readonly mapperHi: number;

    constructor(
        private readonly cartridgeHeader: CartridgeHeader
    ) {
        this.mapperHi = (this.cartridgeHeader.prgSize16K - 1) * Constants.SIXTEEN_KILOBYTES;
    }

    map(addr: Uint16): Uint16 {
        if (addr >= 0x8000 && addr < 0xc000) {
            return 0x8000 + this.mapperLo * Constants.SIXTEEN_KILOBYTES + (addr & 0x3fff);
        }

        if (addr >= 0xc000 && addr < 0x10000) {
            // Upper 16k always point to upper bank
            return 0x8000 + this.mapperHi + (addr & 0x3fff);
        }

        return addr;
    }

    write(addr: Uint16, data: Uint8): void {
        if (addr >= 0x8000 && addr < 0x10000) {
            this.mapperLo = data & 0b1111;
        }
    }
}
