import {Nes} from './nes';
import {CpuConstants} from './cpu';

const enum CpuDebuggerConstants {
    BASE_PRG_ADDR = 0x8000
}

class CpuDebugger {
    readonly nes = new Nes();

    loadProgram(program: string): void {
        this.reset();

        const data = program.split(' ');
        for (let i = 0; i < data.length; i++) {
            const byte = parseInt(data[i], 16);
            if (data[i].length !== 2 || isNaN(byte)) {
                throw new Error(`Corrupted byte ${data[i]}`);
            }

            this.nes.bus.write(CpuDebuggerConstants.BASE_PRG_ADDR + i, byte);

        }
    }

    reset(): void {
        // TODO: need to reset memory?
        this.nes.bus.write(CpuConstants.BASE_INSTRUCTION_ADDR, CpuDebuggerConstants.BASE_PRG_ADDR & 0xff);
        this.nes.bus.write(CpuConstants.BASE_INSTRUCTION_ADDR + 1, (CpuDebuggerConstants.BASE_PRG_ADDR & 0xff00) >> 8);
        this.nes.cpu.reset();
        this.skipCycles();
    }

    // TODO: not instruction, operation
    executeInstruction(): void {
        this.nes.cpu.clock();
        this.skipCycles();
    }

    executeNInstructions(n: number): void {
        while (n-- > 0) {
            this.executeInstruction();
        }
    }

    private skipCycles(): void {
        while (this.nes.cpu.remainingCycles !== 0) {
            this.nes.cpu.clock();
        }
    }
}

export {CpuDebugger};

