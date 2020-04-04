import {Cpu, CpuConstants} from './cpu';
import {DebuggerBus} from './debugger-bus';

const enum CpuDebuggerConstants {
    BASE_PRG_ADDR = 0x8000
}

class CpuDebugger {
    readonly cpu: Cpu;
    readonly bus = new DebuggerBus();

    constructor() {
        this.cpu = new Cpu(this.bus);
    }

    loadProgram(program: string): void {
        this.reset();

        const data = program.split(' ');
        for (let i = 0; i < data.length; i++) {
            const byte = parseInt(data[i], 16);
            if (data[i].length !== 2 || isNaN(byte)) {
                throw new Error(`Corrupted byte ${data[i]}`);
            }

            this.bus.write(CpuDebuggerConstants.BASE_PRG_ADDR + i, byte);

        }
    }

    reset(): void {
        // TODO: need to reset memory?
        this.bus.write(CpuConstants.BASE_INSTRUCTION_ADDR, CpuDebuggerConstants.BASE_PRG_ADDR & 0xff);
        this.bus.write(CpuConstants.BASE_INSTRUCTION_ADDR + 1, (CpuDebuggerConstants.BASE_PRG_ADDR & 0xff00) >> 8);
        this.cpu.reset();
        this.cpu.skipCycles();
    }

    // TODO: not instruction, operation
    executeInstruction(): void {
        this.cpu.clock();
        this.cpu.skipCycles();
    }

    executeNInstructions(n: number): void {
        while (n-- > 0) {
            this.executeInstruction();
        }
    }
}

export {CpuDebugger, CpuDebuggerConstants};
