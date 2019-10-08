import {Bus} from './bus';
import {Cpu} from './cpu';

/*
 * Main NES class
 */

class Nes {
    private readonly _cpu: Cpu;
    private readonly _bus: Bus;

    constructor() {
        this._bus = new Bus();
        this._cpu = new Cpu(this._bus);
        this._cpu.reset();
    }
}

export {Nes}
