import {Cpu} from '../cpu';
import {Bus} from '../interfaces';
import {LOOKUP} from '../lookup';
import {uint8ToHex, iterateRam} from '../utils/utils';

// TODO make real disassembler
class CpuProgramView {
    constructor(private readonly container: HTMLElement) {}

    render(cpu: Cpu, bus: Bus): void {
        const result = [];
        const startAddr = cpu.programCounter;
        for (const addr of iterateRam(startAddr, startAddr + 15)) {
            const byte = bus.read(addr);
            if (addr === startAddr) {
                const [instructionMnemonic, addrModeMnemonic] = LOOKUP[byte];
                result.push(`${instructionMnemonic} (${addrModeMnemonic})`);
            } else {
                result.push(uint8ToHex(byte));
            }
        }

        this.container.innerText = result.join(' ');
    }
}

export {CpuProgramView};
