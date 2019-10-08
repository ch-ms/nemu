/**
 * Bus contains various devices
 */
var Cpu = require('./cpu').Cpu;
var Bus = /** @class */ (function () {
    function Bus() {
        this._cpu = new Cpu();
        this._cpu.connectBus(this);
        // cpu can only address 64k range
        this._ram = new Uint8Array(64 * 1024);
    }
    Bus.prototype.write = function (addr, data) {
        if (addr >= 0x0 && addr <= 0xffff) {
            this._ram[addr] = data;
        }
    };
    Bus.prototype.read = function (addr) {
        if (addr >= 0x0 && addr <= 0xffff) {
            return this._ram[addr];
        }
        // TODO: mb throw error?
        return 0x0;
    };
    return Bus;
}());
