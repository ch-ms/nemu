import {Uint8, Uint16} from './numbers';

interface Readable {
    read(addr: Uint16): Uint8;
}

interface Writable {
    write(addr: Uint16, data: Uint8): void;
}

interface ReadableWriteable extends Readable, Writable {
}

/**
 * Device can be connected to bus
 */
interface Device extends ReadableWriteable {
}

/**
 * Bus make it possible to transfer data between various devices connected to it
 */
interface Bus extends ReadableWriteable {
}

export {Device, Bus};
