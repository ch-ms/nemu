import {LOOKUP} from './lookup';
import {Bus} from './bus';
import {Uint8, Uint16} from './types';

/**
 * Cpu
 */

const enum StatusFlags {
    CARRY = 1 << 0,
    ZERO = 1 << 1,
    DISTABLE_INTERRUPTS = 1 << 2,
    DECIMAL_MODE = 1 << 3,
    BREAK = 1 << 4,
    UNUSED = 1 << 5,
    OVERFLOW = 1 << 6,
    NEGATIVE = 1 << 7
}

class Cpu {
    // Registers
    private _rA: Uint8 = 0;
    private _rX: Uint8 = 0;
    private _rY: Uint8 = 0;
    private _rStackPointer: Uint16 = 0; // Points to location on bus
    private _rProgramCounter: Uint16 = 0;
    private _rStatus: Uint8 = 0;
    private _remainingCycles = 0;

    private readonly _bus: Bus;

    constructor(bus: Bus) {
        this._bus = bus;
    }

    read(addr: Uint16): Uint8 {
        return this._bus.read(addr);
    }

    write(addr: Uint16, data: Uint8): void {
        this._bus.write(addr, data);
    }

    reset(): void {
        // Set PC to address contained in 0xfffc
        const lo = this.read(0xfffc);
        const hi = this.read(0xfffc + 1);
        this._rProgramCounter = (hi << 8) | lo;

        // Set a,x,y to 0
        this._rA = 0;
        this._rX = 0;
        this._rY = 0;

        // Set stack pointer to 0xfd
        this._rStackPointer = 0xFD;

        // Set status to 0x00 and set UNUSED flag to 1
        this._rStatus = 0x00 | StatusFlags.UNUSED;

        // Reset takes 8 cycles
        this._remainingCycles = 8;
    }

    irq(): void {
        // TODO
    }

    /**
     * Non-Maskable Interrupt Request
     */
    nmi(): void {
        // TODO
    }

    /**
     * Perform single clock cycle
     */
    clock(): void {
        if (this._remainingCycles === 0) {
            // Read opcode from rProgramCounter
            const opcode = this.read(this._rProgramCounter);

            // Set flag UNUSED
            this.setFlag(StatusFlags.UNUSED, true);

            // Increment program counter
            this._rProgramCounter += 1;

            // Lookup instructions
            const [instruction, addrMode, cycles] = LOOKUP[opcode];

            // Lookup for remainingCycles from table
            this._remainingCycles = cycles;

            // Fetch data for instruction
            const additionalCycleAddr = this.resolveAddrMode(addrMode)();

            // Perform instruction
            const additionalCycleInstruction = this.resolveInstruction(instruction)();

            // Add additional cycle from addresing mode or instruction itself
            this._remainingCycles += additionalCycleAddr & additionalCycleInstruction;

            // Set the unused to 1
            // (but WFT? we already set it, i think instruction can change it, so we need to set it to 1 after it)
            this.setFlag(StatusFlags.UNUSED, true);
        }

        this._remainingCycles -= 1;
    }

    // TODO: describe all uniq tokens
    // TODO: function description
    private resolveAddrMode(mnemonic: string): () => 1 | 0 {
        throw new Error(`Unknown addressing mode "${mnemonic}"`);
    }

    // TODO: instruction mnemonic as type
    // TODO: function description
    private resolveInstruction(mnemonic: string): () => 1 | 0 {
        throw new Error(`Unknown instruction "${mnemonic}"`);
    }

    private setFlag(flag: StatusFlags, isSet: boolean): void {
        this._rStatus = isSet ? this._rStatus | flag : this._rStatus & ~flag;
    }
}

export {Cpu};
