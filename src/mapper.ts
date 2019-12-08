import {Uint8, Uint16} from './types';
import {CartridgeHeader} from './cartridge-parser';
import {Mapper000} from './mapper-000';

interface Mapper {
    map(addr: Uint16): Uint8;
}

function createMapper(cartridgeHeader: CartridgeHeader): Mapper {
    const {mapper} = cartridgeHeader;

    if (mapper === 0) {
        return new Mapper000(cartridgeHeader);
    }

    throw new Error(`Unknown mapper "${mapper}"`);
}

export {Mapper, createMapper};
