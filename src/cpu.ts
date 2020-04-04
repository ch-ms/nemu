import {LOOKUP, InstructionMnemonic, AddrModeMnemonic} from './lookup';
import {Bus} from './interfaces';
import {Uint8, Uint16, Numbers} from './numbers';

// TODO why BRK has IMM mode?

/*
 * Cpu
 */

type BitValue = 0 | 1;
type AdditionalCycleFlag = BitValue;
type AddrModeReturnValue = [Uint16, AdditionalCycleFlag];

const enum StatusFlags {
    CARRY = 1 << 0,
    ZERO = 1 << 1,
    DISABLE_INTERRUPTS = 1 << 2,
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
    BASE_INTERRUPT_ADDR = 0xfffe,
    BASE_NMI_ADDR = 0xfffa
}

// TODO: check additional cycle flags for all instructions
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

            // Set flag UNUSED
            this.setFlag(StatusFlags.UNUSED, true);

            // Lookup instructions
            const [instruction, addrMode, cycles] = LOOKUP[opcode];

            // Lookup for remainingCycles from table
            this._remainingCycles = cycles;

            // Fetch data for instruction
            const [addr, additionalCycleAddr] = this.resolveAddrMode(addrMode);

            // Perform instruction
            const additionalCycleInstruction = this.resolveInstruction(opcode, instruction, addrMode, addr);

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
                return this.addrModeABOffset(0);

            case 'ABX':
                return this.addrModeABOffset(this._x);

            case 'ABY':
                return this.addrModeABOffset(this._y);

            case 'ZP0':
                return this.addrModeZPOffset(0);

            case 'ZPX':
                return this.addrModeZPOffset(this._x);

            case 'ZPY':
                return this.addrModeZPOffset(this._y);

            case 'IMP':
                return this.addrModeIMP();

            case 'REL':
                return this.addrModeREL();

            case 'IZY':
                return this.addrModeIZY();

            case 'IZX':
                return this.addrModeIZX();

            case 'IND':
                return this.addrModeIND();

            default:
                throw new Error(`Unknown addressing mode "${mnemonic}"`);
        }
    }

    // TODO: function description
    /**
     * Resolve instruction by mnemonic
     */
    private resolveInstruction(opcode: Uint8, mnemonic: InstructionMnemonic, addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        switch (mnemonic) {
            case 'LDA':
                return this.instructionLDA(addr);

            case 'LDX':
                return this.instructionLDX(addr);

            case 'LDY':
                return this.instructionLDY(addr);

            case 'STA':
                return this.instructionSTA(addr);

            case 'STX':
                return this.instructionSTX(addr);

            case 'STY':
                return this.instructionSTY(addr);

            case 'CLC':
                return this.instructionCLC();

            case 'SEC':
                return this.instructionSEC();

            case 'CLD':
                return this.instructionCLD();

            case 'SED':
                return this.instructionSED();

            case 'CLI':
                return this.instructionCLI();

            case 'SEI':
                return this.instructionSEI();

            case 'CLV':
                return this.instructionCLV();

            case 'ADC':
                return this.instructionADC(addr);

            case 'SBC':
                return this.instructionSBC(addr);

            case 'DEY':
                return this.instructionDEY();

            case 'INY':
                return this.instructionINY();

            case 'DEX':
                return this.instructionDEX();

            case 'INX':
                return this.instructionINX();

            case 'INC':
                return this.instructionINC(addr);

            case 'DEC':
                return this.instructionDEC(addr);

            case 'BCC':
                return this.instructionBCC(addr);

            case 'BCS':
                return this.instructionBCS(addr);

            case 'BEQ':
                return this.instructionBEQ(addr);

            case 'BMI':
                return this.instructionBMI(addr);

            case 'BNE':
                return this.instructionBNE(addr);

            case 'BPL':
                return this.instructionBPL(addr);

            case 'BVC':
                return this.instructionBVC(addr);

            case 'BVS':
                return this.instructionBVS(addr);

            case 'NOP':
                return this.instructionNOP(opcode);

            case 'BRK':
                return this.instructionBRK();

            case 'TYA':
                return this.instructionTYA();

            case 'TAY':
                return this.instructionTAY();

            case 'TXS':
                return this.instructionTXS();

            case 'TXA':
                return this.instructionTXA();

            case 'TAX':
                return this.instructionTAX();

            case 'TSX':
                return this.instructionTSX();

            case 'BIT':
                return this.instructionBIT(addr);

            case 'CMP':
                return this.instructionPseudoCMX(addr, this._a);

            case 'CPX':
                return this.instructionPseudoCMX(addr, this._x);

            case 'CPY':
                return this.instructionPseudoCMX(addr, this._y);

            case 'AND':
                return this.instructionAND(addr);

            case 'ORA':
                return this.instructionORA(addr);

            case 'EOR':
                return this.instructionEOR(addr);

            case 'JSR':
                return this.instructionJSR(addr);

            case 'JMP':
                return this.instructionJMP(addr);

            case 'RTS':
                return this.instructionRTS();

            case 'PHA':
                return this.instructionPHA();

            case 'PHP':
                return this.instructionPHP();

            case 'PLA':
                return this.instructionPLA();

            case 'PLP':
                return this.instructionPLP();

            case 'LSR':
                return this.instructionLSR(addrModeMnemonic, addr);

            case 'ROL':
                return this.instructionROL(addrModeMnemonic, addr);

            case 'ROR':
                return this.instructionROR(addrModeMnemonic, addr);

            case 'ASL':
                return this.instructionASL(addrModeMnemonic, addr);

            case 'RTI':
                return this.instructionRTI();

            case 'LAX':
                return this.instructionIllegalLAX(addrModeMnemonic, addr);

            case 'SAX':
                return this.instructionIllegalSAX(addr);

            case 'DCP':
                return this.instructionIllegalDCP(addr);

            case 'ISC':
                return this.instructionIllegalISC(addr);

            case 'SLO':
                return this.instructionIllegalSLO(addrModeMnemonic, addr);

            case 'RLA':
                return this.instructionIllegalRLA(addrModeMnemonic, addr);

            case 'SRE':
                return this.instructionIllegalSRE(addrModeMnemonic, addr);

            case 'RRA':
                return this.instructionIllegalRRA(addrModeMnemonic, addr);

            case 'ALR':
                return this.instructionIllegalALR(addrModeMnemonic, addr);
            case 'ANC':
                return this.instructionIllegalANC(addr);

            case 'XAA':
            case 'LAS':
            case 'STP':
            case 'AXS':
            case 'ARR':
            case 'AHX':
            case 'TAS':
            case 'SHX':
                return this.instructionIllegal();

            default:
                throw new Error(`Unknown instruction "${mnemonic}"`);
        }
    }

    // TODO make it better
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

    getFlag(flag: StatusFlags): BitValue {
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private popFromStack(vector: string): Uint8 {
        //console.log('pop', vector);
        this._stackPointer = (this._stackPointer + 1) & Numbers.UINT8_CAST;
        return this.read(this.stackAddr);
    }

    private pushProgramCounterToStack(): void {
        this.pushToStack((this._programCounter >>> 8) & Numbers.UINT8_CAST);
        this.pushToStack(this._programCounter & Numbers.UINT8_CAST);
    }

    private popProgramCounterFromStack(): Uint16 {
        return this.popFromStack('pc') | (this.popFromStack('pc') << 8);
    }

    /**
     * Immediate addressing mode uses next byte from instruction as data
     */
    private addrModeIMM(): AddrModeReturnValue {
        const addr = this._programCounter;
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        // TODO addr must be addr
        return [addr, 0];
    }

    /**
     * Common method for absolute addressing modes (ABS, ABX, ABY)
     */
    private addrModeABOffset(offset: Uint8): AddrModeReturnValue {
        const lo = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        const page = this.read(this._programCounter);
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        let addr = (page << 8) | lo;

        if (offset === 0) {
            return [addr, 0];
        }

        addr = (addr + offset) & Numbers.UINT16_CAST;

        return [addr, page === (addr & 0xff00) ? 0 : 1];
    }

    /**
     * Common method for zero page addressing modes (ZP0, ZPX, ZPY)
     */
    private addrModeZPOffset(offset: Uint8): AddrModeReturnValue {
        const addr = (this.read(this._programCounter) + offset) & Numbers.UINT8_CAST;
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;

        return [addr, 0];
    }

    /**
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
    private addrModeIZY(): AddrModeReturnValue {
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
    private addrModeIZX(): AddrModeReturnValue {
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
    private addrModeIND(): AddrModeReturnValue {
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
    private instructionLDA(addr: Uint16): AdditionalCycleFlag {
        this._a = this.read(addr);
        this.setZeroAndNegativeByValue(this._a);

        return 1;
    }

    /*
     * Load X register with Memory
     * X = M, Z = X == 0, N = X <= 0
     */
    private instructionLDX(addr: Uint16): AdditionalCycleFlag {
        this._x = this.read(addr);
        this.setZeroAndNegativeByValue(this._x);

        return 1;
    }

    /*
     * Load Y register with Memory
     * Y = M, Z = Y == 0, N = Y <= 0
     */
    private instructionLDY(addr: Uint16): AdditionalCycleFlag {
        this._y = this.read(addr);
        this.setZeroAndNegativeByValue(this._y);

        return 1;
    }

    /*
     * Store A at Memory
     * M = A
     */
    private instructionSTA(addr: Uint16): AdditionalCycleFlag {
        this.write(addr, this._a);
        return 0;
    }

    /*
     * Store X at Memory
     * M = X
     */
    private instructionSTX(addr: Uint16): AdditionalCycleFlag {
        this.write(addr, this._x);
        return 0;
    }

    /*
     * Store Y at Memory
     * M = Y
     */
    private instructionSTY(addr: Uint16): AdditionalCycleFlag {
        this.write(addr, this._y);
        return 0;
    }

    /*
     * Clear carry flag
     * CARRY = 0
     */
    private instructionCLC(): AdditionalCycleFlag {
        this.setFlag(StatusFlags.CARRY, false);
        return 0;
    }

    /*
     * Set carry flag
     * CARRY = 1
     */
    private instructionSEC(): AdditionalCycleFlag {
        this.setFlag(StatusFlags.CARRY, true);
        return 0;
    }

    /*
     * Clear decimal flag
     * DECIMAL_MODE = 0
     */
    private instructionCLD(): AdditionalCycleFlag {
        this.setFlag(StatusFlags.DECIMAL_MODE, false);
        return 0;
    }

    /*
     * Set decimal flag
     * DECIMAL_MODE = 1
     */
    private instructionSED(): AdditionalCycleFlag {
        this.setFlag(StatusFlags.DECIMAL_MODE, true);
        return 0;
    }

    /*
     * Clear interrupt disable flag
     */
    private instructionCLI(): AdditionalCycleFlag {
        this.setFlag(StatusFlags.DISABLE_INTERRUPTS, false);
        return 0;
    }

    /*
     * Set interrupt disable flag
     */
    private instructionSEI(): AdditionalCycleFlag {
        this.setFlag(StatusFlags.DISABLE_INTERRUPTS, true);
        return 0;
    }

    /*
     * Clear overflow flag
     * V = 0
     */
    private instructionCLV(): AdditionalCycleFlag {
        this.setFlag(StatusFlags.OVERFLOW, false);
        return 0;
    }

    /*
     * Add A to Memory with CARRY flag
     * A = A + M + C, Z = A == 0, C = A >= 255, N = A < 0, V = Sign(OLD_A) != Sign(A)
     */
    private instructionADC(addr: Uint16): AdditionalCycleFlag {
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
    private instructionSBC(addr: Uint16): AdditionalCycleFlag {
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
    private instructionDEX(): AdditionalCycleFlag {
        this._x = (this._x - 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(this._x);
        return 0;
    }

    /*
     * Increment X register
     * X = X + 1, Z = X == 0, N = X < 0
     */
    private instructionINX(): AdditionalCycleFlag {
        this._x = (this._x + 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(this._x);
        return 0;
    }

    /*
     * Decrement Y register
     * Y = Y - 1, Z = Y == 0, N = Y < 0
     */
    private instructionDEY(): AdditionalCycleFlag {
        this._y = (this._y - 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(this._y);
        return 0;
    }

    /*
     * Increment Y register
     * Y = Y + 1, Z = Y == 0, N = Y < 0
     */
    private instructionINY(): AdditionalCycleFlag {
        this._y = (this._y + 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(this._y);
        return 0;
    }

    /*
     * Decrement Memory
     * M = M - 1, Z = M == 0, M = X < 0
     */
    private instructionDEC(addr: Uint16): AdditionalCycleFlag {
        const data = (this.read(addr) - 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(data);
        this.write(addr, data);
        return 0;
    }

    /*
     * Increment Memory
     * M = M + 1, Z = M == 0, M = X < 0
     */
    private instructionINC(addr: Uint16): AdditionalCycleFlag {
        const data = (this.read(addr) + 1) & Numbers.UINT8_CAST;
        this.setZeroAndNegativeByValue(data);
        this.write(addr, data);
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
     * PC = PC + addrRel if Z == 0
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
     * PC = PC + addrRel if N != 0
     */
    private instructionBMI(addrRel: Uint16): AdditionalCycleFlag {
        return this.branchOnCondition(this.getFlag(StatusFlags.NEGATIVE) === 1, addrRel);
    }

    /*
     * Branch if positive
     * PC = PC + addrRel if N == 0
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


    /**
     * Program interrupt
     */
    private instructionBRK(): AdditionalCycleFlag {
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
    private instructionRTI(): AdditionalCycleFlag {
        this._status = this.popFromStack('RTI');
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
    private instructionTYA(): AdditionalCycleFlag {
        this._a = this._y;
        this.setZeroAndNegativeByValue(this._a);
        return 0;
    }

    /*
     * Transfer A to Y
     */
    private instructionTAY(): AdditionalCycleFlag {
        this._y = this._a;
        this.setZeroAndNegativeByValue(this._y);
        return 0;
    }

    /*
     * Transfer X to Stack Pointer
     */
    private instructionTXS(): AdditionalCycleFlag {
        this._stackPointer = this._x;
        return 0;
    }

    /*
     * Transfer X to A
     */
    private instructionTXA(): AdditionalCycleFlag {
        this._a = this._x;
        this.setZeroAndNegativeByValue(this._a);
        return 0;
    }

    /*
     * Transfer A to X
     */
    private instructionTAX(): AdditionalCycleFlag {
        this._x = this._a;
        this.setZeroAndNegativeByValue(this._x);
        return 0;
    }

    /*
     * Transfer Stack Pointer to X
     */
    private instructionTSX(): AdditionalCycleFlag {
        this._x = this._stackPointer;
        this.setZeroAndNegativeByValue(this._x);
        return 0;
    }

    /*
     * Test mask pattern in A with Memory
     * A & M, N = M7, V = M6
     */
    private instructionBIT(addr: Uint16): AdditionalCycleFlag {
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
    private instructionPseudoCMX(addr: Uint16, register: Uint16): AdditionalCycleFlag {
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
    private instructionAND(addr: Uint16): AdditionalCycleFlag {
        const data = this.read(addr);
        this._a = this._a & data;
        this.setZeroAndNegativeByValue(this._a);
        return 1;
    }

    /*
     * Logical | on A and Memory
     * Z = A == 0, N = A < 0, A = A | M
     */
    private instructionORA(addr: Uint16): AdditionalCycleFlag {
        this._a |= this.read(addr);
        this.setZeroAndNegativeByValue(this._a);
        return 1;
    }

    /*
     * Logical ^ on A and Memory
     * A = A ^ M, Z = A == 0, N = A < 0
     */
    private instructionEOR(addr: Uint16): AdditionalCycleFlag {
        const data = this.read(addr);
        this._a = this._a ^ data;
        this.setZeroAndNegativeByValue(this._a);
        return 1;
    }

    /**
     * Jump to subroutine.
     * Pushes the addr of the return point to the stack. Set program counter to given addr.
     */
    private instructionJSR(addr: Uint16): AdditionalCycleFlag {
        this._programCounter = (this._programCounter - 1) & Numbers.UINT16_CAST;
        this.pushProgramCounterToStack();
        this._programCounter = addr;
        return 0;
    }

    private instructionJMP(addr: Uint16): AdditionalCycleFlag {
        this._programCounter = addr;
        return 0;
    }

    /**
     * Return from subroutine.
     * Pulls program counter from stack. Set program counter to this addr.
     */
    private instructionRTS(): AdditionalCycleFlag {
        this._programCounter = this.popProgramCounterFromStack();
        this._programCounter = (this._programCounter + 1) & Numbers.UINT16_CAST;
        return 0;
    }

    /**
     * Push a copy of the A to the Stack
     */
    private instructionPHA(): AdditionalCycleFlag {
        this.pushToStack(this._a);
        return 0;
    }

    /**
     * Push a copy of the Status Register to the Stack
     */
    private instructionPHP(): AdditionalCycleFlag {
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
    private instructionPLA(): AdditionalCycleFlag {
        this._a = this.popFromStack('PLA');
        this.setZeroAndNegativeByValue(this._a);
        return 0;
    }

    /**
     * Pulls value from the Stack to the Status
     */
    private instructionPLP(): AdditionalCycleFlag {
        this._status = this.popFromStack('PLP');
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
    private instructionLSR(addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        const data = addrModeMnemonic === 'IMP' ? this._a : this.read(addr);
        this.setFlag(StatusFlags.CARRY, Boolean(data & 0b1));
        const result = data >>> 1;
        this.setZeroAndNegativeByValue(result);

        if (addrModeMnemonic === 'IMP') {
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
    private instructionROL(addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        const data = addrModeMnemonic === 'IMP' ? this._a : this.read(addr);
        const result: Uint8 = ((data << 1) | this.getFlag(StatusFlags.CARRY)) & Numbers.UINT8_CAST;
        this.setFlag(StatusFlags.CARRY, Boolean(data & 0b10000000));
        this.setZeroAndNegativeByValue(result);

        if (addrModeMnemonic === 'IMP') {
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
    private instructionROR(addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        const data = addrModeMnemonic === 'IMP' ? this._a : this.read(addr);
        const result: Uint8 = ((data >>> 1) | (this.getFlag(StatusFlags.CARRY) << 7)) & Numbers.UINT8_CAST;
        this.setFlag(StatusFlags.CARRY, Boolean(data & 0b1));
        this.setZeroAndNegativeByValue(result);

        if (addrModeMnemonic === 'IMP') {
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
    private instructionASL(addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        const data = addrModeMnemonic === 'IMP' ? this._a : this.read(addr);
        const result = (data << 1) & Numbers.UINT8_CAST;
        this.setFlag(StatusFlags.CARRY, Boolean(data & 0b10000000));
        this.setZeroAndNegativeByValue(result);

        if (addrModeMnemonic === 'IMP') {
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
    private instructionIllegalLAX(addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        // https://wiki.nesdev.com/w/index.php/Programming_with_unofficial_opcodes
        // Notice that the immediate is missing;
        // the opcode that would have been LAX is affected by line noise on the data bus.
        // MOS 6502: even the bugs have bugs.
        if (addrModeMnemonic === 'IMM') {
            return 0;
        }

        this.instructionLDA(addr);
        return this.instructionLDX(addr);
    }

    /**
     * Illegal opcode: stores the bitwise AND of A and X
     * M = A & X
     */
    private instructionIllegalSAX(addr: Uint16): AdditionalCycleFlag {
        this.write(addr, this._a & this._x);
        return 0;
    }

    /**
     * Illegal opcode: equivalent to DEC value then CMP value
     * M = M - 1, Z = A == M, C = A >= M, N = A - M
     */
    private instructionIllegalDCP(addr: Uint16): AdditionalCycleFlag {
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
    private instructionIllegalISC(addr: Uint16): AdditionalCycleFlag {
        this.instructionINC(addr);
        return this.instructionSBC(addr);
    }

    /**
     * Illegal opcode: ASL value then ORA value
     * M = M << 1, A = A | M, Z = A == 0, N = A < 0, C = DATA & 0b10000000
     */
    private instructionIllegalSLO(addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        this.instructionASL(addrModeMnemonic, addr);
        return this.instructionORA(addr);
    }

    private instructionIllegalRLA(addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        this.instructionROL(addrModeMnemonic, addr);
        return this.instructionAND(addr);
    }

    private instructionIllegalSRE(addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        this.instructionLSR(addrModeMnemonic, addr);
        return this.instructionEOR(addr);
    }

    private instructionIllegalRRA(addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        this.instructionROR(addrModeMnemonic, addr);
        return this.instructionADC(addr);
    }

    /**
     * Illegal instruction: AND#i then LSR A
     */
    private instructionIllegalALR(addrModeMnemonic: AddrModeMnemonic, addr: Uint16): AdditionalCycleFlag {
        // TOO test
        this.instructionAND(addr);
        return this.instructionLSR(addrModeMnemonic, addr);
    }

    /**
     * Illegal instruction: AND#i then set CARRY same as NEGATIVE
     */
    private instructionIllegalANC(addr: Uint16): AdditionalCycleFlag {
        // TODO test
        const data = this.read(addr);
        this._a = this._a & data;
        this.setZeroAndNegativeByValue(this._a);
        this.setFlag(StatusFlags.CARRY, Boolean(this._a & StatusFlags.NEGATIVE));
        return 0;
    }

    private instructionIllegal(): AdditionalCycleFlag {
        return 0;
    }
}

export {Cpu, CpuConstants, StatusFlags};
