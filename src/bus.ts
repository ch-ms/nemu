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
        }
    }

    read(addr: Uint8): Uint8 {
        if (addr >= 0x0 && addr <= 0xffff) {
            return this._ram[addr];
        }

        // TODO: mb throw error?
        return 0x0;
    }
}

export {Bus};
