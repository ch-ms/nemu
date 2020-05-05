import {Uint8, Uint16} from './numbers';
import {CartridgeHeader} from './cartridge-parser';
import {Mapper000} from './mapper-000';
import {Mapper002} from './mapper-002';

// TODO put more thought into it, refactor!
/**
 * Maps addresses for prg and chr data
 */
interface Mapper {
    map(addr: Uint16): Uint8;
    write(addr: Uint16, data: Uint8): void;
}

function createMapper(cartridgeHeader: CartridgeHeader): Mapper {
    const {mapper} = cartridgeHeader;

    switch (mapper) {
        case 0:
            return new Mapper000(cartridgeHeader);

        case 2:
            return new Mapper002(cartridgeHeader);

        default:
            throw new Error(`Unknown mapper "${mapper}"`);

    }
}

export {Mapper, createMapper};
