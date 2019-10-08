/**
 * Cpu
 */

const STATUS_FLAGS = {
    CARRY: 1 << 0,
    ZERO: 1 << 1,
    DISTABLE_INTERRUPTS: 1 << 2,
    DECIMAL_MODE: 1 << 3,
    BREAK: 1 << 4,
    UNUSED: 1 << 5,
    OVERFLOW: 1 << 6,
    NEGATIVE: 1 << 7
};

class Cpu {
    constructor() {
        this._bus = null;

        // Registers
        this._rA = 0x00;
        this._rX = 0x00;
        this._rY = 0x00;
        // Points to location on bus
        this._rStackPointer = 0x00;
        this._rProgramCounter = 0x0000;
        this._rStatus = 0x00;

        this._remainingCycles = 0;
    }

    connectBus(bus) {
        if (this._bus !== null) {
            throw new Error('Bus is already connected');
        }

        this._bus = bus;
    }

    read(addr) {
        return this._bus.read(addr);
    }

    write(addr, data) {
        this._bus.write(addr, data);
    }

    reset() {
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

        // Set status to 0x00 and set UNSUSED flag to 1
        this._rStatus = 0x00 | STATUS_FLAGS.UNSUSED;

        // Reset takes 8 cycles
        this._remainingCycles = 8;
    }

    irq() {
        // TODO
    }

    /**
     * Non-Maskable Interrupt Request
     */
    nmi() {
        // TODO
    }

    /**
     * Perform single clock cycle
     */
    clock() {
        // TODO
        if (this._remainingCycles === 0) {
            // Read opcode from rProgramCounter
            const opcode = this.read(this._rProgramCounter);

            // Set flag UNUSED
            this._setFlag(UNUSED, true);

            // Increment program counter
            this._rProgramCounter += 1;

            // Lookup for remainingCycles from table
            // this._remainingCycles = lookup[opcode].cycles;

            // Fetch data for instruction
            // const additionalCycleAddressing = lookup[opcode].addrmode()

            // Perform operation
            // const additionalCycleOperation = lookup[opcode].operate();

            // Add additional cycle from addresing mode or operation itself
            // this._remainingCycles += additionalCycleAddressing & additionalCycleOperation;

            // Set the unused to 1
            // (but WFT? we already set it, i think instruction can change it, so we need to set it to 1 after it)
            this._setFlag(UNUSED, true);
        }

        this._remainingCycles -= 1;
    }

    _setFlag(flag, bit) {
        this._rStatus = bit ? this._rStatus | flag : this._rStatus & ~flag;
    }
}

module.exports = {Cpu};
