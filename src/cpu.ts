import {LOOKUP, InstructionMnemonic, AddrModeMnemonic} from './lookup';
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

const enum Constants {
    BASE_STACK_ADDR = 0xfd,
    BASE_INSTRUCTION_ADDR = 0xfffc
}

class Cpu {
    // Registers
    private _a: Uint8 = 0;
    private _x: Uint8 = 0;
    private _y: Uint8 = 0;
    private _stackPointer: Uint16 = 0; // Points to location on bus
    private _programCounter: Uint16 = 0;
    private _status: Uint8 = 0;

    private _remainingCycles = 0;

    private readonly _bus: Bus;

    constructor(bus: Bus) {
        this._bus = bus;
    }

    get a(): Uint8 {
        return this._a;
    }

    get x(): Uint8 {
        return this._x;
    }

    get y(): Uint8 {
        return this._y;
    }

    get stackPointer(): Uint16 {
        return this._stackPointer;
    }

    get programCounter(): Uint16 {
        return this._programCounter;
    }

    get status(): Uint8 {
        return this._status;
    }

    read(addr: Uint16): Uint8 {
        return this._bus.read(addr);
    }

    write(addr: Uint16, data: Uint8): void {
        this._bus.write(addr, data);
    }

    reset(): void {
        // Set PC to address contained in 0xfffc
        const lo = this.read(Constants.BASE_INSTRUCTION_ADDR);
        const hi = this.read(Constants.BASE_INSTRUCTION_ADDR + 1);
        this._programCounter = (hi << 8) | lo;

        // Set a,x,y to 0
        this._a = 0;
        this._x = 0;
        this._y = 0;

        // Set stack pointer to 0xfd
        this._stackPointer = Constants.BASE_STACK_ADDR;

        // Set status to 0x00 and set UNUSED flag to 1
        this._status = 0 | StatusFlags.UNUSED;

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
            const opcode = this.read(this._programCounter);

            // Set flag UNUSED
            this.setFlag(StatusFlags.UNUSED, true);

            // Increment program counter
            this._programCounter += 1;

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
    private resolveAddrMode(mnemonic: AddrModeMnemonic): () => 1 | 0 {
        throw new Error(`Unknown addressing mode "${mnemonic}"`);
    }

    // TODO: instruction mnemonic as type
    // TODO: function description
    private resolveInstruction(mnemonic: InstructionMnemonic): () => 1 | 0 {
        throw new Error(`Unknown instruction "${mnemonic}"`);
    }

    private setFlag(flag: StatusFlags, isSet: boolean): void {
        this._status = isSet ? this._status | flag : this._status & ~flag;
    }
}

export {Cpu};
