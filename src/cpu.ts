import {Bus} from './interfaces';
import {Uint8, Uint16, Numbers, Bit} from './numbers';
import {
    createOpcodeResolver,
    OpcodeResolver,
    OpcodeResolverEntry
} from './opcode-resolver';

type AdditionalCycleFlag = Bit;
type AddrModeReturnValue = [Uint16, AdditionalCycleFlag];

export interface CpuState {
    a: Uint8;
    x: Uint8;
    y: Uint8;
    stackPointer: Uint8;
    programCounter: Uint16;
    status: Uint8;
    remainingCycles: number;
}

export const enum StatusFlags {
    CARRY = 1 << 0,
    ZERO = 1 << 1,
    DISABLE_INTERRUPTS = 1 << 2,
    DECIMAL_MODE = 1 << 3,
    BREAK = 1 << 4,
    UNUSED = 1 << 5,
    OVERFLOW = 1 << 6,
    NEGATIVE = 1 << 7
}

export const enum CpuConstants {
    BASE_STACK_ADDR = 0x0100,
    BASE_STACK_OFFSET = 0xfd,
    BASE_INSTRUCTION_ADDR = 0xfffc,
    BASE_INTERRUPT_ADDR = 0xfffe,
    BASE_NMI_ADDR = 0xfffa
}

export type InstructionFunction = (entry: OpcodeResolverEntry, addr: Uint16) => AdditionalCycleFlag;
export type AddrModeFunction = () => AddrModeReturnValue;

// TODO: check additional cycle flags for all instructions
// TODO: do not expose instruction and addr methods to other classes (except for opcode resolver)
/**
 * Cpu
 */
class Cpu {
    // Registers
    private _a: Uint8 = 0;
    private _x: Uint8 = 0;
    private _y: Uint8 = 0;
    private _stackPointer: Uint8 = 0;
    private _programCounter: Uint16 = 0;
    private _status: Uint8 = 0;

    private _remainingCycles = 0;

    private opcodeResolver: OpcodeResolver;

    constructor(
        private readonly _bus: Bus,
        state?: CpuState
    ) {
        this.opcodeResolver = createOpcodeResolver(this);

        if (state) {
            this._a = state.a;
            this._x = state.x;
            this._y = state.y;
            this._stackPointer = state.stackPointer;
            this._programCounter = state.programCounter;
            this._status = state.status;
            this._remainingCycles = state.remainingCycles;
        }
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

    get stackPointer(): Uint8 {
        return this._stackPointer;
    }

    get stackAddr(): Uint16 {
        return CpuConstants.BASE_STACK_ADDR + this._stackPointer;
    }

    get programCounter(): Uint16 {
        return this._programCounter;
    }

    get status(): Uint8 {
        return this._status;
    }

    get remainingCycles(): number {
        return this._remainingCycles;
    }

    skipCycles(): void {
        while (this.remainingCycles !== 0) {
            this.clock();
        }
    }

    read(addr: Uint16): Uint8 {
        return this._bus.read(addr);
    }

    write(addr: Uint16, data: Uint8): void {
        this._bus.write(addr, data);
    }

    reset(): void {
        // Set PC to address contained in 0xfffc
        const lo = this.read(CpuConstants.BASE_INSTRUCTION_ADDR);
        const hi = this.read(CpuConstants.BASE_INSTRUCTION_ADDR + 1);
        this._programCounter = (hi << 8) | lo;

        // Set a,x,y to 0
        this._a = 0;
        this._x = 0;
        this._y = 0;

        // Set stack pointer to 0xfd
        this._stackPointer = CpuConstants.BASE_STACK_OFFSET;

        // Set status to 0x00 and set UNUSED flag to 1
        this._status = 0 | StatusFlags.UNUSED;

        // Reset takes 8 cycles
        this._remainingCycles = 8;
    }

    /**
     * Interrupt
     * Push program counter, status flags to the stack
     * Read program counter from specific address then jumps
     */
    irq(): void {
        // TODO same as BRK and NMI
        // TODO test
        if (this.getFlag(StatusFlags.DISABLE_INTERRUPTS)) {
            return;
        }

        this.pushProgramCounterToStack();

        // Set status flags and write status register to the stack
        // https://wiki.nesdev.com/w/index.php/Status_flags#The_B_flag
        this.setFlag(StatusFlags.BREAK, false);
        this.setFlag(StatusFlags.UNUSED, true);
        this.setFlag(StatusFlags.DISABLE_INTERRUPTS, true);
        this.pushToStack(this._status);

        // Read add from 0xfffa and set pc to that addr
        const lo = this.read(CpuConstants.BASE_INTERRUPT_ADDR);
        const hi = this.read(CpuConstants.BASE_INTERRUPT_ADDR + 1);
        this._programCounter = (hi << 8) | lo;

        this._remainingCycles = 7;
    }

    /**
     * Non maskable interupt
     * Pushes the processor status register and return address on the stack, reads the NMI handler's address from $FFFA-$FFFB
     */
    nmi(): void {
        // Write return addr to the stack
        this.pushProgramCounterToStack();

        // Set status flags and write status register to the stack
        // https://wiki.nesdev.com/w/index.php/Status_flags#The_B_flag
        this.setFlag(StatusFlags.BREAK, false);
        this.setFlag(StatusFlags.UNUSED, true);
        this.setFlag(StatusFlags.DISABLE_INTERRUPTS, true);
        this.pushToStack(this._status);

        // Read add from 0xfffa and set pc to that addr
        const lo = this.read(CpuConstants.BASE_NMI_ADDR);
        const hi = this.read(CpuConstants.BASE_NMI_ADDR + 1);
        this._programCounter = (hi << 8) | lo;

        this._remainingCycles = 8;
    }

    /*
     * Perform single clock cycle
     */
    clock(): void {
        if (this._remainingCycles === 0) {
            // Read opcode from rProgramCounter
            // TODO: mb read from pc and inc?
            const opcode = this.read(this._programCounter);
            this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;

            // Lookup instructions
            const entry: OpcodeResolverEntry = this.opcodeResolver[opcode];
            const [, , , cycles, instructionFunction, addrModeFunction] = entry;

            // Lookup for remainingCycles from table
            this._remainingCycles = cycles;

            // Fetch data for instruction
            const [addr, additionalCycleAddr] = addrModeFunction();

            // Perform instruction
            const additionalCycleInstruction = instructionFunction(entry, addr);

            // Add additional cycle from addresing mode or instruction itself
            this._remainingCycles += additionalCycleAddr & additionalCycleInstruction;

            // After each instruction reset unused flag
            this.setFlag(StatusFlags.UNUSED, true);
        }

        this._remainingCycles -= 1;
    }

    serialize(): CpuState {
        return {
            a: this._a,
            x: this._x,
            y: this._y,
            stackPointer: this._stackPointer,
            programCounter: this._programCounter,
            status: this._status,
            remainingCycles: this._remainingCycles
        };
    }

    // TODO this thing is for debug purposes (tests etc)
    // We need better interface for this
    setFlagDebug(flag: StatusFlags, isSet: boolean): void {
        this.setFlag(flag, isSet);
    }

    private setFlag(flag: StatusFlags, isSet: boolean): void {
        this._status = isSet ? this._status | flag : (this._status & ~flag) & Numbers.UINT8_CAST;
    }

    private setZeroAndNegativeByValue(value: Uint8): void {
        this.setFlag(StatusFlags.ZERO, value === 0);
        this.setFlag(StatusFlags.NEGATIVE, (value & StatusFlags.NEGATIVE) !== 0);
    }

    getFlag(flag: StatusFlags): Bit {
        return (this._status & flag) && 1;
    }

    /*
     * Helper: branch on condition
     */
    private branchOnCondition(condition: boolean, addrRel: Uint16): 0 {
        if (condition) {
            this._remainingCycles += 1;

            const addr = this._programCounter + addrRel;

            // Stepping through page boundary requires additional clock cycle
            if ((addr & 0xff00) !== (this._programCounter & 0xff00)) {
                this._remainingCycles += 1;
            }

            this._programCounter = addr;
        }

        return 0;
    }

    private pushToStack(data: Uint8): void {
        this.write(this.stackAddr, data);
        this._stackPointer = (this._stackPointer - 1) & Numbers.UINT8_CAST;
    }

    private popFromStack(): Uint8 {
        this._stackPointer = (this._stackPointer + 1) & Numbers.UINT8_CAST;
        return this.read(this.stackAddr);
    }

    private pushProgramCounterToStack(): void {
        this.pushToStack(this._programCounter >>> 8);
        this.pushToStack(this._programCounter & Numbers.UINT8_CAST);
    }

    private popProgramCounterFromStack(): Uint16 {
        return this.popFromStack() | (this.popFromStack() << 8);
    }

    /**
     * Immediate addressing mode uses next byte from instruction as data
     */
    addrModeIMM = (): AddrModeReturnValue => {
        const addr = this._programCounter;
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        // TODO addr must be addr
        return [addr, 0];
    }

    /**
     * Absolute addressing mode
     */
    addrModeABS = (): AddrModeReturnValue => {
        const lo = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        const page = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        const addr = (page << 8) | lo;

        return [addr, 0];
    }

    /**
     * Absolute addressing mode with X register offset
     */
    addrModeABX = (): AddrModeReturnValue => {
        const lo = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        const page = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        const addr = (((page << 8) | lo) + this._x) & Numbers.UINT16_CAST;

        return [addr, page === (addr & 0xff00) ? 0 : 1];
    }

    /**
     * Absolute addressing mode with Y register offset
     */
    addrModeABY = (): AddrModeReturnValue => {
        const lo = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        const page = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        const addr = (((page << 8) | lo) + this._y) & Numbers.UINT16_CAST;

        return [addr, page === (addr & 0xff00) ? 0 : 1];
    }

    /**
     * Zero page addressing mode
     */
    addrModeZP0 = (): AddrModeReturnValue => {
        const addr = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;

        return [addr, 0];
    }

    /**
     * Zero page addressing mode with X register offset
     */
    addrModeZPX = (): AddrModeReturnValue => {
        const addr = (this.read(this._programCounter) + this._x) & Numbers.UINT8_CAST;
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;

        return [addr, 0];
    }

    /**
     * Zero page addressing mode with Y register offset
     */
    addrModeZPY = (): AddrModeReturnValue => {
        const addr = (this.read(this._programCounter) + this._y) & Numbers.UINT8_CAST;
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;

        return [addr, 0];
    }

    /**
     * No data requires for instruction
     */
    addrModeIMP = (): AddrModeReturnValue => {
        // TODO: how to return null addr?
        return [0, 0];
    }

    /*
     * Exclusive to branch instructions
     * Address must reside within -128 to +127 relative to the instruction after branch instruction
     */
    addrModeREL = (): AddrModeReturnValue => {
        let addrRelative: Uint16 = 0x0000 | this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        if (addrRelative & 0x80) {
            addrRelative = -256 + addrRelative;
        }

        // TODO: addrRelative is not the same shit as addrAbs, need to account that
        return [addrRelative, 0];
    }

    /**
     * Indirect indexed addressing mode with Y offset.
     * Instruction contains offset in zero page to addr. Y register added to this addr to form final addr.
     */
    addrModeIZY = (): AddrModeReturnValue => {
        const offset = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;

        const lo = this.read(offset);
        const page = this.read((offset + 1) & Numbers.UINT8_CAST);
        const addr = (((page << 8) | lo) + this._y) & Numbers.UINT16_CAST;

        return [addr, page === (addr & 0xff00) ? 0 : 1];
    }

    /**
     * Indirect indexed addresing mode with X offset.
     * Instruction contains 8-bit offset for zero page which is offset by X register to read 16-bit address from zero page.
     */
    addrModeIZX = (): AddrModeReturnValue => {
        const offset = this.read(this._programCounter) + this._x;
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;

        const lo = this.read(offset & 0xff);
        const hi = this.read((offset + 1) & 0xff);

        return [(hi << 8) | lo, 0];
    }

    /**
     * Inderect addressing mode.
     * Read address from given absolute address.
     * This instruction has hardware bug:
     *     if given address is pointing to the page boundary then high bit of the target address will be read from start of the page.
     */
    addrModeIND = (): AddrModeReturnValue => {
        const targetLo = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        const targetHi = this.read(this._programCounter) << 8;
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        const target = targetHi | targetLo;

        const lo = this.read(target);
        // To simulate bug read high bit from the start of the page
        const hi = this.read(targetLo === 0xff ? targetHi : target + 1);

        return [(hi << 8) | lo, 0];
    }

    /*
     * Load A register with Memory
     * A = M, Z = A == 0, N = A <= 0
     */
    instructionLDA = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this._a = this.read(addr);
        this.setZeroAndNegativeByValue(this._a);

        return 1;
    }

    /*
     * Load X register with Memory
     * X = M, Z = X == 0, N = X <= 0
     */
    instructionLDX = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this._x = this.read(addr);
        this.setZeroAndNegativeByValue(this._x);

        return 1;
    }

    /*
     * Load Y register with Memory
     * Y = M, Z = Y == 0, N = Y <= 0
     */
    instructionLDY = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this._y = this.read(addr);
        this.setZeroAndNegativeByValue(this._y);

        return 1;
    }

    /*
     * Store A at Memory
     * M = A
     */
    instructionSTA = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this.write(addr, this._a);
        return 0;
    }

    /*
     * Store X at Memory
     * M = X
     */
    instructionSTX = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this.write(addr, this._x);
        return 0;
    }

    /*
     * Store Y at Memory
     * M = Y
     */
    instructionSTY = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this.write(addr, this._y);
        return 0;
    }

    /*
     * Clear carry flag
     * CARRY = 0
     */
    instructionCLC = (): AdditionalCycleFlag => {
        this.setFlag(StatusFlags.CARRY, false);
        return 0;
    }

    /*
     * Set carry flag
     * CARRY = 1
     */
    instructionSEC = (): AdditionalCycleFlag => {
        this.setFlag(StatusFlags.CARRY, true);
        return 0;
    }

    /*
     * Clear decimal flag
     * DECIMAL_MODE = 0
     */
    instructionCLD = (): AdditionalCycleFlag => {
        this.setFlag(StatusFlags.DECIMAL_MODE, false);
        return 0;
    }

    /*
     * Set decimal flag
     * DECIMAL_MODE = 1
     */
    instructionSED = (): AdditionalCycleFlag => {
        this.setFlag(StatusFlags.DECIMAL_MODE, true);
        return 0;
    }

    /*
     * Clear interrupt disable flag
     */
    instructionCLI = (): AdditionalCycleFlag => {
        this.setFlag(StatusFlags.DISABLE_INTERRUPTS, false);
        return 0;
    }

    /*
     * Set interrupt disable flag
     */
    instructionSEI = (): AdditionalCycleFlag => {
        this.setFlag(StatusFlags.DISABLE_INTERRUPTS, true);
        return 0;
    }

    /*
     * Clear overflow flag
     * V = 0
     */
    instructionCLV = (): AdditionalCycleFlag => {
        this.setFlag(StatusFlags.OVERFLOW, false);
        return 0;
    }

    /*
     * Add A to Memory with CARRY flag
     * A = A + M + C, Z = A == 0, C = A >= 255, N = A < 0, V = Sign(OLD_A) != Sign(A)
     */
    instructionADC = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        const data = this.read(addr);
        const result = this._a + data + this.getFlag(StatusFlags.CARRY);

        this.setFlag(StatusFlags.CARRY, result > 255);
        // TODO doc this trick
        this.setFlag(
            StatusFlags.OVERFLOW,
            Boolean((~(this._a ^ data) & (this._a ^ result)) & StatusFlags.NEGATIVE)
        );

        // Register A is 8 bit
        this._a = result & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(this._a);

        return 1;
    }

    /*
     * Subtract data in addr from acc with borrow
     * A = A - M - (1 - C)
     * N Z C V
     */
    instructionSBC = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        // ^ 0xff flip lo 8 bits, can use ~ but it will flip all bits in 32 bit int
        const data = this.read(addr) ^ 0xff;
        // M ^ 0xff = -M - 1
        // So: A - M - (1 - C) = A - M - 1 + C = A + (M ^ 0xff) + C
        const result: Uint16 = this._a + data + this.getFlag(StatusFlags.CARRY);

        this.setFlag(StatusFlags.CARRY, (result & 0xff00) !== 0);
        // See explanation in instructionADC
        this.setFlag(
            StatusFlags.OVERFLOW,
            Boolean((~(this._a ^ data) & (this._a ^ result)) & StatusFlags.NEGATIVE)
        );

        this._a = result & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(this._a);

        return 1;
    }


    /*
     * Descrement X register
     * X = X - 1, Z = X == 0, N = X < 0
     */
    instructionDEX = (): AdditionalCycleFlag => {
        this._x = (this._x - 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(this._x);
        return 0;
    }

    /*
     * Increment X register
     * X = X + 1, Z = X == 0, N = X < 0
     */
    instructionINX = (): AdditionalCycleFlag => {
        this._x = (this._x + 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(this._x);
        return 0;
    }

    /*
     * Decrement Y register
     * Y = Y - 1, Z = Y == 0, N = Y < 0
     */
    instructionDEY = (): AdditionalCycleFlag => {
        this._y = (this._y - 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(this._y);
        return 0;
    }

    /*
     * Increment Y register
     * Y = Y + 1, Z = Y == 0, N = Y < 0
     */
    instructionINY = (): AdditionalCycleFlag => {
        this._y = (this._y + 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(this._y);
        return 0;
    }

    /*
     * Decrement Memory
     * M = M - 1, Z = M == 0, M = X < 0
     */
    instructionDEC = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        const data = (this.read(addr) - 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(data);
        this.write(addr, data);
        return 0;
    }

    /*
     * Increment Memory
     * M = M + 1, Z = M == 0, M = X < 0
     */
    instructionINC = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        const data = (this.read(addr) + 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(data);
        this.write(addr, data);
        return 0;
    }

    /*
     * Branch if not equal
     */
    instructionBNE = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        return this.branchOnCondition(this.getFlag(StatusFlags.ZERO) === 0, addr);
    }

    /*
     * Branch if equal
     * PC = PC + addr if Z == 0
     */
    instructionBEQ = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        return this.branchOnCondition(this.getFlag(StatusFlags.ZERO) === 1, addr);
    }

    /*
     * Branch if carry clear
     */
    instructionBCC = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        return this.branchOnCondition(this.getFlag(StatusFlags.CARRY) === 0, addr);
    }

    /*
     * Branch if carry set
     */
    instructionBCS = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        return this.branchOnCondition(this.getFlag(StatusFlags.CARRY) === 1, addr);
    }

    /*
     * Branch if minus
     * PC = PC + addr if N != 0
     */
    instructionBMI = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        return this.branchOnCondition(this.getFlag(StatusFlags.NEGATIVE) === 1, addr);
    }

    /*
     * Branch if positive
     * PC = PC + addr if N == 0
     */
    instructionBPL = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        return this.branchOnCondition(this.getFlag(StatusFlags.NEGATIVE) === 0, addr);
    }

    /*
     * Branch if overflow clear
     */
    instructionBVC = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        return this.branchOnCondition(this.getFlag(StatusFlags.OVERFLOW) === 0, addr);
    }

    /*
     * Branch if overflow set
     */
    instructionBVS = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        return this.branchOnCondition(this.getFlag(StatusFlags.OVERFLOW) === 1, addr);
    }

    /*
     * Just nothing
     */
    instructionNOP = (entry: OpcodeResolverEntry): AdditionalCycleFlag => {
        const opcode = entry[0];
        // Not all NOPs are equal
        if (
            opcode === 0x1c ||
            opcode === 0x3c ||
            opcode === 0x5c ||
            opcode === 0x7c ||
            opcode === 0xdc ||
            opcode === 0xfc
        ) {
            return 1;
        }

        return 0;
    }


    /**
     * Program interrupt
     */
    instructionBRK = (): AdditionalCycleFlag => {
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;

        this.pushProgramCounterToStack();

        // Always set BREAK and UNUSED flag
        // https://wiki.nesdev.com/w/index.php/Status_flags#The_B_flag
        this.setFlag(StatusFlags.DISABLE_INTERRUPTS, true);
        this.setFlag(StatusFlags.BREAK, true);
        this.setFlag(StatusFlags.UNUSED, true);
        this.pushToStack(this._status);

        this.setFlag(StatusFlags.BREAK, false);

        this._programCounter = this.read(CpuConstants.BASE_INTERRUPT_ADDR) | (this.read(CpuConstants.BASE_INTERRUPT_ADDR + 1) << 8);
        return 0;
    }

    /**
     * Return from interrupt
     */
    instructionRTI = (): AdditionalCycleFlag => {
        this._status = this.popFromStack();
        // Strange things with BREAK & UNUSED
        // https://wiki.nesdev.com/w/index.php/Status_flags#The_B_flag
        this.setFlag(StatusFlags.BREAK, false);
        this.setFlag(StatusFlags.UNUSED, false);
        this._programCounter = this.popProgramCounterFromStack();
        return 0;
    }

    /*
     * Transfer Y to A
     */
    instructionTYA = (): AdditionalCycleFlag => {
        this._a = this._y;
        this.setZeroAndNegativeByValue(this._a);
        return 0;
    }

    /*
     * Transfer A to Y
     */
    instructionTAY = (): AdditionalCycleFlag => {
        this._y = this._a;
        this.setZeroAndNegativeByValue(this._y);
        return 0;
    }

    /*
     * Transfer X to Stack Pointer
     */
    instructionTXS = (): AdditionalCycleFlag => {
        this._stackPointer = this._x;
        return 0;
    }

    /*
     * Transfer X to A
     */
    instructionTXA = (): AdditionalCycleFlag => {
        this._a = this._x;
        this.setZeroAndNegativeByValue(this._a);
        return 0;
    }

    /*
     * Transfer A to X
     */
    instructionTAX = (): AdditionalCycleFlag => {
        this._x = this._a;
        this.setZeroAndNegativeByValue(this._x);
        return 0;
    }

    /*
     * Transfer Stack Pointer to X
     */
    instructionTSX = (): AdditionalCycleFlag => {
        this._x = this._stackPointer;
        this.setZeroAndNegativeByValue(this._x);
        return 0;
    }

    /*
     * Test mask pattern in A with Memory
     * A & M, N = M7, V = M6
     */
    instructionBIT = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        const data = this.read(addr);
        this.setFlag(StatusFlags.ZERO, (data & this._a) === 0);
        this.setFlag(StatusFlags.NEGATIVE, (data & StatusFlags.NEGATIVE) !== 0);
        this.setFlag(StatusFlags.OVERFLOW, (data & StatusFlags.OVERFLOW) !== 0);
        return 0;
    }

    /**
     * Pseudo instruction, combines logic for CMP, CPX, CPY
     * CMP: Compares A with Memory
     * CPX: Compare X with Memory
     * CPY: Compare Y with Memory
     * Z = register == M, C = register >= M, N = register - M
     */
    instructionPseudoCMX = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        // TODO is it good solution to throw 2 ifs?
        const register = entry[1] === 'CMP' ? this._a : (entry[1] === 'CPX' ? this._x : this._y);
        const data = this.read(addr);
        const result: Uint16 = (register - data) & Numbers.UINT16_CAST;
        this.setZeroAndNegativeByValue(result & Numbers.UINT8_CAST);
        this.setFlag(StatusFlags.CARRY, register >= data);
        return 0;
    }

    /*
     * Logical & on A and Memory
     * Z = A == 0, N = A < 0, A = A & M
     */
    instructionAND = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        const data = this.read(addr);
        this._a = this._a & data;
        this.setZeroAndNegativeByValue(this._a);
        return 1;
    }

    /*
     * Logical | on A and Memory
     * Z = A == 0, N = A < 0, A = A | M
     */
    instructionORA = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this._a |= this.read(addr);
        this.setZeroAndNegativeByValue(this._a);
        return 1;
    }

    /*
     * Logical ^ on A and Memory
     * A = A ^ M, Z = A == 0, N = A < 0
     */
    instructionEOR = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        const data = this.read(addr);
        this._a = this._a ^ data;
        this.setZeroAndNegativeByValue(this._a);
        return 1;
    }

    /**
     * Jump to subroutine.
     * Pushes the addr of the return point to the stack. Set program counter to given addr.
     */
    instructionJSR = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this._programCounter = (this._programCounter - 1) & Numbers.UINT16_CAST;
        this.pushProgramCounterToStack();
        this._programCounter = addr;
        return 0;
    }

    instructionJMP = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this._programCounter = addr;
        return 0;
    }

    /**
     * Return from subroutine.
     * Pulls program counter from stack. Set program counter to this addr.
     */
    instructionRTS = (): AdditionalCycleFlag => {
        this._programCounter = this.popProgramCounterFromStack();
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        return 0;
    }

    /**
     * Push a copy of the A to the Stack
     */
    instructionPHA = (): AdditionalCycleFlag => {
        this.pushToStack(this._a);
        return 0;
    }

    /**
     * Push a copy of the Status Register to the Stack
     */
    instructionPHP = (): AdditionalCycleFlag => {
        // Always set BREAK and UNUSED flag
        // https://wiki.nesdev.com/w/index.php/Status_flags#The_B_flag
        this.setFlag(StatusFlags.BREAK, true);
        this.setFlag(StatusFlags.UNUSED, true);
        this.pushToStack(this._status);
        this.setFlag(StatusFlags.BREAK, false);
        this.setFlag(StatusFlags.UNUSED, false);
        return 0;
    }

    /**
     * Pulls value from the Stack to the A
     * Z = A == 0, N = A < 0
     */
    instructionPLA = (): AdditionalCycleFlag => {
        this._a = this.popFromStack();
        this.setZeroAndNegativeByValue(this._a);
        return 0;
    }

    /**
     * Pulls value from the Stack to the Status
     */
    instructionPLP = (): AdditionalCycleFlag => {
        this._status = this.popFromStack();
        // Strange things with BREAK & UNUSED
        // https://wiki.nesdev.com/w/index.php/Status_flags#The_B_flag
        this.setFlag(StatusFlags.BREAK, false);
        this.setFlag(StatusFlags.UNUSED, false);
        return 0;
    }

    /**
     * Logical shift right
     * C = DATA & 0b1, Z = RESULT == 0, N = RESULT < 0
     */
    instructionLSR = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        const data = entry[2] === 'IMP' ? this._a : this.read(addr);
        this.setFlag(StatusFlags.CARRY, Boolean(data & 0b1));
        const result = data >>> 1;
        this.setZeroAndNegativeByValue(result);

        if (entry[2] === 'IMP') {
            this._a = result;
        } else {
            this.write(addr, result);
        }

        return 0;
    }

    /**
     * Rotate left
     * C = DATA & 0b100000000, Z = RESULT == 0, N = RESULT < 0
     */
    instructionROL = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        const data = entry[2] === 'IMP' ? this._a : this.read(addr);
        const result: Uint8 = ((data << 1) | this.getFlag(StatusFlags.CARRY)) & Numbers.UINT8_CAST;
        this.setFlag(StatusFlags.CARRY, Boolean(data & 0b10000000));
        this.setZeroAndNegativeByValue(result);

        if (entry[2] === 'IMP') {
            this._a = result;
        } else {
            this.write(addr, result);
        }

        return 0;
    }

    /**
     * Rotate right
     * C = DATA & 0b1, Z = RESULT == 0, N = RESULT < 0
     */
    instructionROR = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        const data = entry[2] === 'IMP' ? this._a : this.read(addr);
        const result: Uint8 = ((data >>> 1) | (this.getFlag(StatusFlags.CARRY) << 7)) & Numbers.UINT8_CAST;
        this.setFlag(StatusFlags.CARRY, Boolean(data & 0b1));
        this.setZeroAndNegativeByValue(result);

        if (entry[2] === 'IMP') {
            this._a = result;
        } else {
            this.write(addr, result);
        }

        return 0;
    }

    /**
     * Arithmetic shift left
     * C = DATA & 0b10000000, Z = RESULT == 0, N = RESULT < 0
     */
    instructionASL = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        const data = entry[2] === 'IMP' ? this._a : this.read(addr);
        const result = (data << 1) & Numbers.UINT8_CAST;
        this.setFlag(StatusFlags.CARRY, Boolean(data & 0b10000000));
        this.setZeroAndNegativeByValue(result);

        if (entry[2] === 'IMP') {
            this._a = result;
        } else {
            this.write(addr, result);
        }
        return 0;
    }

    /**
     * Illegal opcode: shortcut for LDA value then TAX
     * X = A, Z = X === 0, N = RESULT < 0
     */
    instructionIllegalLAX = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        // https://wiki.nesdev.com/w/index.php/Programming_with_unofficial_opcodes
        // Notice that the immediate is missing;
        // the opcode that would have been LAX is affected by line noise on the data bus.
        // MOS 6502: even the bugs have bugs.
        if (entry[2] === 'IMM') {
            return 0;
        }

        this.instructionLDA(entry, addr);
        return this.instructionLDX(entry, addr);
    }

    /**
     * Illegal opcode: stores the bitwise AND of A and X
     * M = A & X
     */
    instructionIllegalSAX= (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this.write(addr, this._a & this._x);
        return 0;
    }

    /**
     * Illegal opcode: equivalent to DEC value then CMP value
     * M = M - 1, Z = A == M, C = A >= M, N = A - M
     */
    instructionIllegalDCP= (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        // DEC part
        const data = (this.read(addr) - 1) & Numbers.UINT8_CAST;
        this.write(addr, data);

        // CMP part
        const result: Uint16 = (this._a - data) & Numbers.UINT16_CAST;
        this.setZeroAndNegativeByValue(result & Numbers.UINT8_CAST);
        this.setFlag(StatusFlags.CARRY, this._a >= data);
        return 0;
    }

    /**
     * Illegal opcode: INC the contents of a memory location and SBC result from A register
     * M = M + 1, A = A - M
     */
    instructionIllegalISC= (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this.instructionINC(entry, addr);
        return this.instructionSBC(entry, addr);
    }

    /**
     * Illegal opcode: ASL value then ORA value
     * M = M << 1, A = A | M, Z = A == 0, N = A < 0, C = DATA & 0b10000000
     */
    instructionIllegalSLO = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this.instructionASL(entry, addr);
        return this.instructionORA(entry, addr);
    }

    instructionIllegalRLA = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this.instructionROL(entry, addr);
        return this.instructionAND(entry, addr);
    }

    instructionIllegalSRE = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this.instructionLSR(entry, addr);
        return this.instructionEOR(entry, addr);
    }

    instructionIllegalRRA = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        this.instructionROR(entry, addr);
        return this.instructionADC(entry, addr);
    }

    /**
     * Illegal instruction: AND#i then LSR A
     */
    instructionIllegalALR = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        // TODO test
        this.instructionAND(entry, addr);
        return this.instructionLSR(entry, addr);
    }

    /**
     * Illegal instruction: AND#i then set CARRY same as NEGATIVE
     */
    instructionIllegalANC = (entry: OpcodeResolverEntry, addr: Uint16): AdditionalCycleFlag => {
        // TODO test
        const data = this.read(addr);
        this._a = this._a & data;
        this.setZeroAndNegativeByValue(this._a);
        this.setFlag(StatusFlags.CARRY, Boolean(this._a & StatusFlags.NEGATIVE));
        return 0;
    }

    instructionIllegal = (): AdditionalCycleFlag => {
        return 0;
    }
}

export {Cpu};
