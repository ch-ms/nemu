import {Uint8, Uint16} from './numbers';
import {Writable} from './interfaces';
import {PulseChannel, DutyCycleIndex} from './pulse-channel';
import {TriangleChannel} from './triangle-channel';
import {NoiseChannel} from './noise-channel';
import {Constants} from './constants';
import {Numbers, Bit} from './numbers';

// https://wiki.nesdev.com/w/index.php/APU_registers
export const enum ApuConstants {
    PULSE_1_CONTROL = 0x4000,
    PULSE_1_SWEEP = 0x4001,
    PULSE_1_FINE_TUNE = 0x4002,
    PULSE_1_COARSE_TUNE = 0x4003,
    PULSE_2_CONTROL = 0x4004,
    PULSE_2_SWEEP = 0x4005,
    PULSE_2_FINE_TUNE = 0x4006,
    PULSE_2_COARSE_TUNE = 0x4007,
    TRIANGLE_CONTROL_1 = 0x4008,
    TRIANGLE_CONTROL_2 = 0x4009,
    TRIANGLE_FREQUENCY_1 = 0x400a,
    TRIANGLE_FREQUENCY_2 = 0x400b,
    NOISE_CONTROL_1 = 0x400c,
    UNUSED = 0x400d,

    NOISE_FREQUENCY_1 = 0x400e,
    NOISE_FREQUENCY_2 = 0x400f,
    DELTA_MODULATION_CONTROL = 0x4010,
    DELTA_MODULATION_DIRECT_LOAD = 0x4011,
    DELTA_MODULATION_ADDR = 0x4012,
    DELTA_MODULATION_DATA_LENGTH = 0x4013,

    STATUS = 0x4015,

    FRAME_COUNTER = 0x4017
}

const LENGTH_LOOKUP = [
    0xa, 0xfe, 0x14, 0x2, 0x28, 0x4, 0x50, 0x6,
    0xa0, 0x8, 0x3c, 0xa, 0xe, 0xc, 0x1a, 0xe,
    0xc, 0x10, 0x18, 0x12, 0x30, 0x14, 0x60, 0x16,
    0xc0, 0x18, 0x48, 0x1a, 0x10, 0x1c, 0x20, 0x1e
];

// NTSC
const NOISE_PERIOD_LOOKUP = [
    4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068
];

/**
 * Nes Audio Processing Unit
 */
// TODO Except for the status register, all other registers are write-only. The "value of the register" refers to the last value written to the register.
// TODO Where is a bug somewhere in a sweep unit (I think), check pulse test rom (sub.nes)
class Apu implements Writable {
    readonly pulse1: PulseChannel;
    readonly pulse2: PulseChannel;
    readonly triangle: TriangleChannel;
    readonly noise: NoiseChannel;

    private frameClockCounter = 0;

    constructor() {
        this.pulse1 = new PulseChannel();
        this.pulse2 = new PulseChannel(1);
        this.triangle = new TriangleChannel();
        this.noise = new NoiseChannel();
    }

    write(addr: Uint16, data: Uint8): void {
        switch (addr) {
            case ApuConstants.PULSE_1_CONTROL:
            case ApuConstants.PULSE_2_CONTROL: {
                const channel = addr === ApuConstants.PULSE_1_CONTROL ? this.pulse1 : this.pulse2;

                // Since we pick only 2 bits it match DutyCycleIndex perfectly
                channel.setDuty(data >>> 6 as DutyCycleIndex);
                channel.halt = (data & 0b100000) && 1;

                channel.volume = data & 0b1111;
                // Envelope loop share same bit with halt
                channel.envelopeLoop = channel.halt;
                channel.envelopeDisable = (data & 0b10000) && 1;
                break;
            }

            case ApuConstants.PULSE_1_SWEEP:
            case ApuConstants.PULSE_2_SWEEP: {
                const channel = addr === ApuConstants.PULSE_1_SWEEP ? this.pulse1 : this.pulse2;
                channel.sweepEnable = (data & 0b10000000) && 1;
                channel.sweepPeriod = (data >>> 4) & 0b1111;
                channel.sweepNegate = (data & 0b1000) && 1;
                channel.sweepShift = data & 0b111;
                channel.sweepResetNextClock = true;
                return;
            }

            case ApuConstants.PULSE_1_FINE_TUNE:
            case ApuConstants.PULSE_2_FINE_TUNE: {
                const channel = addr === ApuConstants.PULSE_1_FINE_TUNE ? this.pulse1 : this.pulse2;
                channel.period = (channel.period & 0xff00) | data;
                return;
            }

            case ApuConstants.PULSE_1_COARSE_TUNE:
            case ApuConstants.PULSE_2_COARSE_TUNE: {
                const channel = addr === ApuConstants.PULSE_1_COARSE_TUNE ? this.pulse1 : this.pulse2;
                channel.period = ((data & 0x7) << 8) | (channel.period & 0xff);
                // When the enabled bit is cleared (via $4015),
                // the length counter is forced to 0 and cannot be changed until
                // enabled is set again (the length counter's previous value is lost).
                if (channel.enable) {
                    channel.length = LENGTH_LOOKUP[data >>> 3];
                }

                channel.envelopeResetNextClock = true;
                return;
            }

            case ApuConstants.TRIANGLE_CONTROL_1:
                this.triangle.control = (data & Constants.BIT_8) && 1;
                this.triangle.linearCounterReload = data & 0b01111111;
                break;

            case ApuConstants.TRIANGLE_CONTROL_2:
                // Does nothing
                break;

            case ApuConstants.TRIANGLE_FREQUENCY_1:
                this.triangle.period = (this.triangle.period & 0xff00) | data;
                break;

            case ApuConstants.TRIANGLE_FREQUENCY_2:
                this.triangle.period = (this.triangle.period & Numbers.UINT8_CAST) | ((data & 0b111) << 8);
                if (this.triangle.enable) {
                    this.triangle.lengthCounter = LENGTH_LOOKUP[data >>> 3];
                }
                this.triangle.linearCounterReloadFlag = true;
                break;

            case ApuConstants.NOISE_CONTROL_1:
                this.noise.lengthHalt = (data & Constants.BIT_6) && 1;
                this.noise.envelopeDisable = (data & Constants.BIT_5) && 1;
                this.noise.volume = (data & 0xf);
                break;

            case ApuConstants.UNUSED:
                break;

            case ApuConstants.NOISE_FREQUENCY_1:
                this.noise.mode = (data & Constants.BIT_8) && 1;
                this.noise.period = NOISE_PERIOD_LOOKUP[data & 0xf];
                break;

            case ApuConstants.NOISE_FREQUENCY_2:
                this.noise.lengthCounter = LENGTH_LOOKUP[data >>> 3];
                // TODO do we need to reset envelope for pulses?
                this.pulse1.envelopeResetNextClock = true;
                this.pulse2.envelopeResetNextClock = true;
                this.noise.envelopeResetNextClock = true;
                break;

            case ApuConstants.DELTA_MODULATION_CONTROL:
                break;

            case ApuConstants.DELTA_MODULATION_DIRECT_LOAD:
                break;

            case ApuConstants.DELTA_MODULATION_ADDR:
                break;

            case ApuConstants.DELTA_MODULATION_DATA_LENGTH:
                break;

            // TODO It is the only register which can also be read.
            // When $4015 is read, the status of the channels' length counters and bytes remaining in the current DMC sample, and interrupt flags are returned.
            // Afterwards the Frame Sequencer's frame interrupt flag is cleared.
            case ApuConstants.STATUS:
                // TODO clear DMC IRQ flag
                // TODO enable dmc channel
                // TODO If d is set and the DMC's DMA reader has no more sample bytes to fetch, the DMC sample is restarted. If d is clear then the DMA reader's sample bytes remaining is set to 0.
                this.pulse1.enable = (data & 0b1) as Bit;
                // When the enabled bit is cleared (via $4015),
                // the length counter is forced to 0 and cannot be changed until
                // enabled is set again (the length counter's previous value is lost).
                if (!this.pulse1.enable) {
                    this.pulse1.length = 0;
                }
                this.pulse2.enable = (data & 0b10) && 1;
                if (!this.pulse2.enable) {
                    this.pulse2.length = 0;
                }

                this.triangle.enable = (data & Constants.BIT_3) && 1;
                if (!this.triangle.enable) {
                    this.triangle.lengthCounter = 0;
                }

                this.noise.enable = (data & Constants.BIT_4) && 1;
                if (!this.noise.enable) {
                    this.noise.lengthCounter = 0;
                }
                break;

            case ApuConstants.FRAME_COUNTER:
                break;

            default:
                throw new Error(`Unknown apu register "0x${addr.toString(16)}"`);
        }

    }

    clock(): void {
        this.frameClockCounter++;
        let quarterFrameClock = false;
        let halfFrameClock = false;

        // 4 step sequence mode
        // http://www.slack.net/~ant/nes-emu/apu_ref.txt
        // TODO calc values
        // TODO 5 step sequencer mode
        if (this.frameClockCounter === 3729) {
            quarterFrameClock = true;
        }

        if (this.frameClockCounter === 7457) {
            quarterFrameClock = true;
            halfFrameClock = true;
        }

        if (this.frameClockCounter === 11186) {
            quarterFrameClock = true;
        }

        if (this.frameClockCounter === 14916) {
            // TODO set interrupt flag
            quarterFrameClock = true;
            halfFrameClock = true;
            this.frameClockCounter = 0;
        }

        this.triangle.clock(quarterFrameClock, halfFrameClock);
        this.noise.clock(quarterFrameClock, halfFrameClock);
        this.pulse1.clock(quarterFrameClock, halfFrameClock);
        this.pulse2.clock(quarterFrameClock, halfFrameClock);
    }
}

export {Apu};
