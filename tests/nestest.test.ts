const fs = require('fs');
import {parseCartridge} from '../src/cartridge-parser';
import {Cartridge} from '../src/cartridge';
import {Nes} from '../src/nes';
import {StatusFlags} from '../src/cpu';
import {uint16ToHex, uint8ToHex} from '../src/utils/utils';

interface LogEntry {
    programCounter: number,
    a: number,
    x: number,
    y: number,
    sp: number,
    cyc: number
    status: number,
    resolvedOperation: string
}

describe('Compare cpu behavior with nestest.log.txt', () => {
    const nestestLog: LogEntry[] = JSON.parse(fs.readFileSync('./tests/nestest.log.json'));
    const nestestJson = JSON.parse(fs.readFileSync('./data/nestest.nes.json'));
    const nestestRom = new Uint8Array(nestestJson).buffer;
    const cartridgeData = parseCartridge(nestestRom);
    // Jump to 0xc000 to start test
    cartridgeData.prgRom[16380] = 0x00;
    cartridgeData.prgRom[16380 + 1] = 0xc0;
    const cartridge = new Cartridge(cartridgeData);
    const nes = new Nes(cartridge);
    const {cpu} = nes;

    let currentIndex = -1;
    // TODO extend works for all test suite :(
    expect.extend({
        toEqual<T>(received: T, value: T): {message: () => string, pass: boolean} {
            return {
                message: (): string => {
                    const entry = nestestLog[currentIndex];
                    return [
                        `flags: N V U B D I Z C`,
                        `received: ${received}`,
                        `expected: ${value}`,
                        `Line ${currentIndex + 1} PC $${uint16ToHex(entry.programCounter)} ${entry!.resolvedOperation}`,
                        currentIndex > 0 ? `Previous ${JSON.stringify(nestestLog[currentIndex - 1])}` : ''
                    ].join('\n');
                },
                pass: received === value
            };
        }
    });

    it.only('should match the log', () => {
        // To match the initial state
        cpu.setFlagDebug(StatusFlags.DISABLE_INTERRUPTS, true);

        for (currentIndex = 0; currentIndex < nestestLog.length; currentIndex++) {
            const entry = nestestLog[currentIndex];

            // Think about status flags
            expect(`$${uint8ToHex(cpu.status)} ${cpu.status.toString(2)}`)
                .toEqual(`$${uint8ToHex(entry.status)} ${entry.status.toString(2)}`);
            // TODO pass hints directly
            expect(['A', cpu.a].join('=')).toEqual(['A', entry.a].join('='));
            expect(['X', cpu.x].join('=')).toEqual(['X', entry.x].join('='));
            expect(['Y', cpu.y].join('=')).toEqual(['Y', entry.y].join('='));
            expect(['SP', cpu.stackPointer].join('=')).toEqual(['SP', entry.sp].join('='));
            expect(uint16ToHex(cpu.programCounter)).toEqual(uint16ToHex(entry.programCounter));
            // TODO CYC refers to CPU cycles
            //expect(nes.getCycle()).toEqual(entry.cyc);
            nes.stepOperation();
        }
    });
});
