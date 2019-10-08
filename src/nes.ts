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

    // TODO: for debug purpose, make it safer later
    get bus(): Bus {
        return this._bus;
    }

    // TODO: for debug purpose, make it safer later
    get cpu(): Cpu {
        return this._cpu;
    }
}

export {Nes}
