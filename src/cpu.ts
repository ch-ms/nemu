import {LOOKUP, InstructionMnemonic, AddrModeMnemonic} from './lookup';
import {Bus} from './bus';
import {Uint8, Uint16} from './types';

/*
 * Cpu
 */

type BitValue = 0 | 1;
type AdditionalCycleFlag = BitValue;
type AddrModeReturnValue = [Uint16, AdditionalCycleFlag];

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

const enum CpuConstants {
    BASE_STACK_ADDR = 0x0100,
    BASE_STACK_OFFSET = 0xfd,
    BASE_INSTRUCTION_ADDR = 0xfffc,
    BASE_INTERRUPT_ADDR = 0xfffe
}

class Cpu {
    // Registers
    private _a: Uint8 = 0;
    private _x: Uint8 = 0;
    private _y: Uint8 = 0;
    private _stackPointer: Uint8 = 0; // Points to location on bus
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

    get remainingCycles(): number {
        return this._remainingCycles;
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

    /*
     * Perform single clock cycle
     */
    clock(): void {
        if (this._remainingCycles === 0) {
            // Read opcode from rProgramCounter
            // TODO: mb read from pc and inc?
            const opcode = this.read(this._programCounter);
            this._programCounter += 1;

            // Set flag UNUSED
            this.setFlag(StatusFlags.UNUSED, true);

            // Lookup instructions
            const [instruction, addrMode, cycles] = LOOKUP[opcode];

            // Lookup for remainingCycles from table
            this._remainingCycles = cycles;

            // Fetch data for instruction
            const [addr, additionalCycleAddr] = this.resolveAddrMode(addrMode);

            // Perform instruction
            const additionalCycleInstruction = this.resolveInstruction(opcode, instruction, addr);

            // Add additional cycle from addresing mode or instruction itself
            this._remainingCycles += additionalCycleAddr & additionalCycleInstruction;

            // Set the unused to 1
            // (but WFT? we already set it, i think instruction can change it, so we need to set it to 1 after it)
            this.setFlag(StatusFlags.UNUSED, true);
        }

        this._remainingCycles -= 1;
    }

    // TODO: function description
    private resolveAddrMode(mnemonic: AddrModeMnemonic): AddrModeReturnValue {
        switch (mnemonic) {
            case 'IMM':
                return this.addrModeIMM();

            case 'ABS':
                return this.addrModeABS();

            case 'IMP':
                return this.addrModeIMP();

            case 'REL':
                return this.addrModeREL();

            default:
                throw new Error(`Unknown addressing mode "${mnemonic}"`);
        }
    }

    // TODO: function description
    private resolveInstruction(opcode: Uint8, mnemonic: InstructionMnemonic, addr: Uint16): AdditionalCycleFlag {
        switch (mnemonic) {
            case 'LDX':
                return this.instructionLDX(addr);

            case 'LDY':
                return this.instructionLDY(addr);

            case 'LDA':
                return this.instructionLDA(addr);

            case 'STX':
                return this.instructionSTX(addr);

            case 'CLC':
                return this.instructionCLC();

            case 'CLD':
                return this.instructionCLD();

            case 'SED':
                return this.instructionSED();

            case 'ADC':
                return this.instructionADC(addr);

            case 'SBC':
                return this.instructionSBC(addr);

            case 'DEY':
                return this.instructionDEY();

            case 'DEX':
                return this.instructionDEX();

            case 'BNE':
                return this.instructionBNE(addr);

            case 'BCC':
                return this.instructionBCC(addr);

            case 'BCS':
                return this.instructionBCS(addr);

            case 'BMI':
                return this.instructionBMI(addr);

            case 'BPL':
                return this.instructionBPL(addr);

            case 'BEQ':
                return this.instructionBEQ(addr);

            case 'BVC':
                return this.instructionBVC(addr);

            case 'BVS':
                return this.instructionBVS(addr);

            case 'STA':
                return this.instructionSTA(addr);

            case 'NOP':
                return this.instructionNOP(opcode);

            case 'BRK':
                return this.instructionBRK();

            default:
                throw new Error(`Unknown instruction "${mnemonic}"`);
        }
    }

    private setFlag(flag: StatusFlags, isSet: boolean): void {
        this._status = isSet ? this._status | flag : this._status & ~flag;
    }

    private setZeroAndNegativeByValue(value: Uint8): void {
        this.setFlag(StatusFlags.ZERO, value === 0);
        this.setFlag(StatusFlags.NEGATIVE, (value & StatusFlags.NEGATIVE) !== 0);
    }

    private getFlag(flag: StatusFlags): BitValue {
        return (this._status & flag) === 0 ? 0 : 1;
    }

    /*
     * Immediate addressing mode uses next byte from instruction as data
     */
    private addrModeIMM(): AddrModeReturnValue {
        const addr = this._programCounter;
        this._programCounter += 1;
        return [addr, 0];
    }

    /*
     * Absolute addressing mode uses next two bytes to form address
     */
    private addrModeABS(): AddrModeReturnValue {
        const lo = this.read(this._programCounter);
        this._programCounter += 1;
        const hi = this.read(this._programCounter);
        this._programCounter += 1;

        // TODO: mb pack?
        return [hi << 8 | lo, 0];
    }

    /*
     * No data requires for instruction
     */
    private addrModeIMP(): AddrModeReturnValue {
        // TODO: how to return null addr?
        return [0, 0];
    }

    /*
     * Exclusive to branch instructions
     * Address must reside within -128 to +127 relative to the instruction after branch instruction
     */
    private addrModeREL(): AddrModeReturnValue {
        let addrRelative: Uint16 = 0x0000 | this.read(this._programCounter);
        this._programCounter += 1;
        if (addrRelative & 0x80) {
            addrRelative = -256 + addrRelative;
        }

        // TODO: addrRelative is not the same shit as addrAbs, need to account that
        return [addrRelative, 0];
    }

    /*
     * Load X register with data from memory, setting zero and negative flags as appropriate
     */
    // TODO: WTF we need additional cycle flag?
    private instructionLDX(addr: Uint16): AdditionalCycleFlag {
        this._x = this.read(addr);
        this.setZeroAndNegativeByValue(this._x);

        return 1;
    }

    /*
     * Load Y register with data from memory, setting zero and negative flags as appropriate
     */
    private instructionLDY(addr: Uint16): AdditionalCycleFlag {
        this._y = this.read(addr);
        this.setZeroAndNegativeByValue(this._y);

        return 1;
    }

    /*
     * Load A register with data from memory, setting zero and negative flags as appropriate
     */
    private instructionLDA(addr: Uint16): AdditionalCycleFlag {
        this._a = this.read(addr);
        this.setZeroAndNegativeByValue(this._a);

        return 1;
    }

    /*
     * Store X register at given address
     */
    private instructionSTX(addr: Uint16): AdditionalCycleFlag {
        this.write(addr, this._x);
        return 0;
    }

    /*
     * Clear carry flag
     */
    private instructionCLC(): AdditionalCycleFlag {
        this.setFlag(StatusFlags.CARRY, false);
        return 0;
    }

    /*
     * Clear decimal flag
     */
    private instructionCLD(): AdditionalCycleFlag {
        this.setFlag(StatusFlags.DECIMAL_MODE, false);
        return 0;
    }

    /*
     * Set decimal flag
     */
    private instructionSED(): AdditionalCycleFlag {
        this.setFlag(StatusFlags.DECIMAL_MODE, true);
        return 0;
    }

    /*
     * Add data in addr to acc with CARRY flag
     */
    private instructionADC(addr: Uint16): AdditionalCycleFlag {
        const data = this.read(addr);
        const result = this._a + data + this.getFlag(StatusFlags.CARRY);

        this.setFlag(StatusFlags.CARRY, result > 255);
        this.setFlag(
            StatusFlags.OVERFLOW,
            Boolean((~(this._a ^ data) & (this._a ^ result)) & StatusFlags.NEGATIVE)
        );

        // Register A is 8 bit
        this._a = result & 0xff;
        this.setZeroAndNegativeByValue(this._a);

        return 1;
    }

    /*
     * Subtract data in addr from acc with borrow
     * A = A - M - (1 - C)
     * N Z C V
     */
    private instructionSBC(addr: Uint16): AdditionalCycleFlag {
        const data = ~this.read(addr);
        const result = this._a + data + this.getFlag(StatusFlags.CARRY);

        // TODO: same as addition
        // TODO: Clear if overflow in bit 7?
        this.setFlag(StatusFlags.CARRY, result > 255);
        this.setFlag(
            StatusFlags.OVERFLOW,
            Boolean((~(this._a ^ data) & (this._a ^ result)) & StatusFlags.NEGATIVE)
        );

        this._a = result & 0xff;
        this.setZeroAndNegativeByValue(this._a);

        return 1;
    }

    /*
     * Descrement X register
     */
    private instructionDEX(): AdditionalCycleFlag {
        // TODO: mb bug if y is zero?
        this._x -= 1;
        this.setZeroAndNegativeByValue(this._x);
        return 0;
    }

    /*
     * Decrement Y register
     */
    private instructionDEY(): AdditionalCycleFlag {
        // TODO: mb bug if y is zero?
        this._y -= 1;
        this.setZeroAndNegativeByValue(this._y);
        return 0;
    }

    /*
     * Branch if not equal
     */
    private instructionBNE(addrRel: Uint16): AdditionalCycleFlag {
        return this.branchOnCondition(this.getFlag(StatusFlags.ZERO) === 0, addrRel);
    }

    /*
     * Branch if equal
     */
    private instructionBEQ(addrRel: Uint16): AdditionalCycleFlag {
        return this.branchOnCondition(this.getFlag(StatusFlags.ZERO) === 1, addrRel);
    }

    /*
     * Branch if carry clear
     */
    private instructionBCC(addrRel: Uint16): AdditionalCycleFlag {
        return this.branchOnCondition(this.getFlag(StatusFlags.CARRY) === 0, addrRel);
    }

    /*
     * Branch if carry set
     */
    private instructionBCS(addrRel: Uint16): AdditionalCycleFlag {
        return this.branchOnCondition(this.getFlag(StatusFlags.CARRY) === 1, addrRel);
    }

    /*
     * Branch if minus
     */
    private instructionBMI(addrRel: Uint16): AdditionalCycleFlag {
        return this.branchOnCondition(this.getFlag(StatusFlags.NEGATIVE) === 1, addrRel);
    }

    /*
     * Branch if positive
     */
    private instructionBPL(addrRel: Uint16): AdditionalCycleFlag {
        return this.branchOnCondition(this.getFlag(StatusFlags.NEGATIVE) === 0, addrRel);
    }

    /*
     * Branch if overflow clear
     */
    private instructionBVC(addrRel: Uint16): AdditionalCycleFlag {
        return this.branchOnCondition(this.getFlag(StatusFlags.OVERFLOW) === 0, addrRel);
    }

    /*
     * Branch if overflow set
     */
    private instructionBVS(addrRel: Uint16): AdditionalCycleFlag {
        return this.branchOnCondition(this.getFlag(StatusFlags.OVERFLOW) === 1, addrRel);
    }

    /*
     * Store accumulator at address
     */
    private instructionSTA(addr: Uint16): AdditionalCycleFlag {
        this.write(addr, this._a);
        return 0;
    }

    /*
     * Just nothing
     */
    private instructionNOP(opcode: Uint8): AdditionalCycleFlag {
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

    /*
     * Program interrupt
     */
    private instructionBRK(): AdditionalCycleFlag {
        this._programCounter += 1;

        // TODO: mb push to stack?
        this.write(CpuConstants.BASE_STACK_ADDR + this._stackPointer, (this._programCounter >> 8) & 0x00ff);
        this._stackPointer -= 1;
        this.write(CpuConstants.BASE_STACK_ADDR + this._stackPointer, this._programCounter & 0x00ff);
        this._stackPointer -= 1;

        this.setFlag(StatusFlags.DISTABLE_INTERRUPTS, true);
        this.setFlag(StatusFlags.BREAK, true);
        this.write(CpuConstants.BASE_STACK_ADDR + this._stackPointer, this._status);
        this._stackPointer -= 1;
        // TODO: why?
        this.setFlag(StatusFlags.BREAK, false);

        this._programCounter = this.read(CpuConstants.BASE_INTERRUPT_ADDR) | (this.read(CpuConstants.BASE_INTERRUPT_ADDR + 1) << 8);
        return 0;
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
}

export {Cpu, CpuConstants};
