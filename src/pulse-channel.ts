import {Constants} from './constants';
import {Uint8, Bit, Uint16} from './numbers';

export type DutyCycleIndex = 0 | 1 | 2 | 3;

export const enum DutyCycle {
    TWELVE_AND_HALF = 0.125,
    TWENTY_FIVE = 0.25,
    FIFTY = 0.5,
    SEVENTY_FIVE = 0.75
}

const enum DutyCycleShifter {
    TWELVE_AND_HALF = 0b00000001,
    TWENTY_FIVE = 0b00000011,
    FIFTY = 0b00001111,
    SEVENTY_FIVE = 0b11111100
}

const DUTY_CYCLE_LOOKUP: [DutyCycle, DutyCycle, DutyCycle, DutyCycle] = [
    DutyCycle.TWELVE_AND_HALF, DutyCycle.TWENTY_FIVE, DutyCycle.FIFTY, DutyCycle.SEVENTY_FIVE
];

const DUTY_CYCLE_SHIFTER_LOOKUP: [DutyCycleShifter, DutyCycleShifter, DutyCycleShifter, DutyCycleShifter] = [
    DutyCycleShifter.TWELVE_AND_HALF, DutyCycleShifter.TWENTY_FIVE, DutyCycleShifter.FIFTY, DutyCycleShifter.SEVENTY_FIVE
];

// TODO if I changed period it only applies when sequencer timer equal zero
// TODO outside interface
export class PulseChannel {
    outputVolume = 0;

    // Duty cycle of the pulse wave
    duty: DutyCycle = DutyCycle.FIFTY;
    private dutyShifter: DutyCycleShifter = DutyCycleShifter.FIFTY;

    // Period of the pulse wave, translated to the output frequency
    period: Uint16 = 0;
    private timer: Uint16 = 0;

    // Length counter
    halt: Bit = 0; /* Halts length count */
    enable: Bit = 0;
    length: Uint8 = 0;

    // Volume envelope
    volume: Uint8 = 0;
    envelopeLoop: Bit = 0;
    envelopeDisable: Bit = 0;
    envelopeResetNextClock = false;
    private envelopeCounter = 0;
    private envelopeDivider = 0;

    // Sweep unit
    sweepEnable: Bit = 0;
    sweepPeriod: Uint8 = 0;
    sweepNegate: Bit = 0;
    sweepShift: Uint8 = 0;
    sweepResetNextClock = false;
    private sweepDivider = 0;
    private sweepNextPeriod: Uint16 = 0;
    sweepMute = false;

    constructor(private readonly channelNumber: Bit = 0) {
        this.setDuty(2);
    }

    setDuty(i: DutyCycleIndex): void {
        this.duty = DUTY_CYCLE_LOOKUP[i];
        this.dutyShifter = DUTY_CYCLE_SHIFTER_LOOKUP[i];
    }

    clock(quarterFrame: boolean, halfFrame: boolean): void {
        this.updateSweepNextPeriodAndMuteFlag();

        if (quarterFrame) {
            // Adjust envelope
            if (this.envelopeResetNextClock) {
                this.envelopeResetNextClock = false;
                this.envelopeCounter = 15;
                this.envelopeDivider = this.volume;
            } else if (this.envelopeDivider === 0) {
                this.envelopeDivider = this.volume;

                if (this.envelopeLoop && this.envelopeCounter === 0) {
                    this.envelopeCounter = 15;
                } else if (this.envelopeCounter !== 0) {
                    this.envelopeCounter--;
                }
            } else {
                this.envelopeDivider--;
            }

            this.outputVolume = this.envelopeDisable ? this.volume : this.envelopeCounter;
        }

        if (halfFrame) {
            // Adjust note length
            if (this.length !== 0 && !this.halt) {
                this.length--;
            }

            // Adjust sweeper
            if (
                this.sweepEnable &&
                this.sweepDivider === 0 &&
                // If the shift count is zero, the channel's period is never updated, but muting logic still applies.
                this.sweepShift !== 0 &&
                !this.sweepMute
            ) {
                this.period = this.sweepNextPeriod;
                // Whenever the current period changes for any reason,
                // whether by $400x writes or by sweep, the target period also changes.
                this.updateSweepNextPeriodAndMuteFlag();
            }

            // If the divider's counter is zero or the reload flag is true:
            //   The counter is set to P and the reload flag is cleared.
            //   Otherwise, the counter is decremented.
            if (this.sweepDivider === 0 || this.sweepResetNextClock) {
                this.sweepResetNextClock = false;
                this.sweepDivider = this.sweepPeriod + 1;
            } else {
                this.sweepDivider--;
            }
        }

        if (this.timer) {
            this.timer--;
        } else {
            this.timer = this.period;
            // Rotate right 1 bit
            this.dutyShifter = ((this.dutyShifter & Constants.BIT_1) << 7) | (this.dutyShifter >>> 1);
        }
    }

    private updateSweepNextPeriodAndMuteFlag(): void {
        const sweepChange = this.period >>> this.sweepShift;
        this.sweepNextPeriod = (
            this.sweepNegate ?
                // Pulse 1 adds the ones' complement (−c − 1). Making 20 negative produces a change amount of −21.
                // Pulse 2 adds the two's complement (−c). Making 20 negative produces a change amount of −20.
                this.period + ~sweepChange + this.channelNumber :
                this.period + sweepChange
        );

        // When the channel's period is less than 8 or the result of
        // the shifter is greater than $7FF, the channel's DAC receives
        // 0 and the sweep unit doesn't change the channel's period.
        // Muting is regardless of the enable flag and regardless of whether the sweep divider
        // is not outputting a clock signal.
        this.sweepMute = this.period < 8 || this.sweepNextPeriod > 0x7ff;
    }
}
