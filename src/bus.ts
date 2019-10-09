import {Cpu} from './cpu';
import {Uint8, Uint16} from './types';

/**
 * Bus contains various devices
 */

class Bus {
    private readonly _cpu = new Cpu(this);
    // cpu can only address 64k range
    private readonly _ram = new Uint8Array(64 * 1024);

    write(addr: Uint16, data: Uint8): void {
        if (addr >= 0x0 && addr <= 0xffff) {
            this._ram[addr] = data;
            return;
        }

        throw Error(`addr "${addr}" is out of addressible range [0x0000, 0xffff]`)
    }

    read(addr: Uint16): Uint8 {
        if (addr >= 0x0 && addr <= 0xffff) {
            return this._ram[addr];
        }

        throw Error(`addr "${addr}" is out of addressible range [0x0000, 0xffff]`)
    }
}

export {Bus};
