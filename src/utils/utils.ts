import {Uint8, Uint16} from '../numbers';
import {Cpu} from '../cpu';

function stuffWithZeros(str: string, size: number): string {
    if (str.length >= size) {
        return str;
    }

    while (str.length !== size) {
        str = `0${str}`;
    }

    return str;
}

function uint8ToHex(uint8: Uint8): string {
    const hex = uint8.toString(16);
    return stuffWithZeros(hex, 2);
}

function uint16ToHex(uint16: Uint16): string {
    const hex = uint16.toString(16);
    return stuffWithZeros(hex, 4);
}

function cpuStatusToFormattedString(cpu: Cpu): string {
    const result = [
        `       NVUBDIZC`,
        `Flags: ${stuffWithZeros(cpu.status.toString(2), 8)} `,
        `PC: $${uint16ToHex(cpu.programCounter)}`,
        `SP: $${uint8ToHex(cpu.stackPointer)}`,
        `A: $${uint8ToHex(cpu.a)}`,
        `X: $${uint8ToHex(cpu.x)}`,
        `Y: $${uint8ToHex(cpu.y)}`
    ];

    return result.join('\n');
}

function* iterateRam(startAddr: Uint16, endAddr: Uint16): IterableIterator<number> {
    for (let addr = startAddr; addr <= endAddr; addr++) {
        yield addr;
    }
}

function* iteratePage(addrInPage: Uint16): IterableIterator<number> {
    const pageAddr = addrInPage & 0xff00;
    for (const addr of iterateRam(pageAddr, pageAddr + 0xff)) {
        yield addr;
    }
}

function fillUint8Array(target: Uint8Array, source: number[]): void {
    if (target.length !== source.length) {
        throw new Error(`Length does not match "${target.length} != ${source.length}"`);
    }

    for (const [i, v] of source.entries()) {
        target[i] = v;
    }
}

export {
    cpuStatusToFormattedString,
    uint8ToHex,
    uint16ToHex,
    iterateRam,
    iteratePage,
    fillUint8Array
};
