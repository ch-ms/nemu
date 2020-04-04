import {Uint8} from './numbers';

const enum ControllerButtons {
    A = 1 << 7,
    B = 1 << 6,
    SELECT = 1 << 5,
    START = 1 << 4,
    UP = 1 << 3,
    DOWN = 1 << 2,
    LEFT = 1 << 1,
    RIGHT = 1
}

type ControllerInterface = () => Uint8;

function defaultControllerInterface(): Uint8 {
    return 0;
}

export {
    ControllerButtons,
    ControllerInterface,
    defaultControllerInterface
};
