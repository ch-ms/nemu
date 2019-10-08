/**
 * Bus contains various devices
 */

const {Cpu} = require('./cpu');

class Bus() {
    constructor() {
        this._cpu = new Cpu();
        this._cpu.connectBus(this);

        // cpu can only address 64k range
        this._ram = new Uint8Array(64 * 1024);
    }

    write(addr, data) {
        if (addr >= 0x0 && addr <= 0xffff) {
            this._ram[addr] = data;
        }
    }

    read(addr) {
        if (addr >= 0x0 && addr <= 0xffff) {
            return this._ram[addr];
        }

        // TODO: mb throw error?
        return 0x0;
    }
}
