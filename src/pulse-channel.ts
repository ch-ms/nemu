import {PulseWaveOscillator} from './pulse-wave-oscillator';
import {Uint8, Bit, Uint16, Numbers} from './numbers';
import {Timings} from './nes';

type DutyCycle = 0.125 | 0.25 | 0.5 | 0.75;

const enum Constants {
    MAX_VOLUME = 0b1111
}

// TODO if I changed period it only applies when sequencer timer equal zero

class PulseChannel {
    // Duty cycle of the pulse wave
    public duty: DutyCycle = 0.5;

    // Period of the pulse wave, translated to the output frequency
    public period: Uint16 = 0;

    // Length counter
    public halt: Bit = 0; /* Halts length count */
    public enable: Bit = 0;
    public length: Uint8 = 0;

    // Volume envelope
    public volume: Uint8 = 0;
    public envelopeLoop: Bit = 0;
    public envelopeDisable: Bit = 0;
    public envelopeResetNextClock = false;
    private envelopeCounter = 0;
    private envelopeDivider = 0;

    // Sweep unit
    public sweepEnable: Bit = 0;
    public sweepPeriod: Uint8 = 0;
    public sweepNegate: Bit = 0;
    public sweepShift: Uint8 = 0;
    public sweepResetNextClock = false;
    private sweepDivider = 0;
    private sweepNextPeriod: Uint16 = 0;
    private sweepMute = false;

    constructor(
        private readonly output?: PulseWaveOscillator,
        private readonly channelNumber: Bit = 0
    ) {
    }

    quarterFrameClock(): void {
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

        if (this.output) {
            this.output.volume.gain.value =
                (this.envelopeDisable ? this.volume : this.envelopeCounter) / Constants.MAX_VOLUME;
        }
    }

    halfFrameClock(): void {
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

    preClock(): void {
        this.updateSweepNextPeriodAndMuteFlag();
    }

    clock(): void {
        // Set output values
        if (!this.output) {
            return;
        }

        if (this.length === 0 || this.sweepMute) {
            this.output.stop();
        } else {
            const frequency = Timings.CPU_CLOCK_HZ / (16 * (this.period + 1));
            this.output.setFrequencyAndDutyCycle(Math.min(Math.max(-22050, frequency), 22050), this.duty);
            this.output.start();
        }
    }

    private updateSweepNextPeriodAndMuteFlag(): void {
        const sweepChange = this.period >>> this.sweepShift;
        // Pulse 1 adds the ones' complement (−c − 1). Making 20 negative produces a change amount of −21.
        // Pulse 2 adds the two's complement (−c). Making 20 negative produces a change amount of −20.
        this.sweepNextPeriod = (
            this.sweepNegate ?
                this.period + ~sweepChange + this.channelNumber :
                this.period + sweepChange
        ) & Numbers.UINT16_CAST;

        // When the channel's period is less than 8 or the result of
        // the shifter is greater than $7FF, the channel's DAC receives
        // 0 and the sweep unit doesn't change the channel's period.
        // Muting is regardless of the enable flag and regardless of whether the sweep divider
        // is not outputting a clock signal.
        this.sweepMute = this.period < 8 || this.sweepNextPeriod > 0x7ff;
    }
}

export {DutyCycle, PulseChannel};
