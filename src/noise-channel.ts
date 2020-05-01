import {Uint16, Uint8, Bit} from './numbers';
import {Constants} from './constants';

// TODO outside interface
export class NoiseChannel {
    enable: Bit = 0;
    outputVolume = 0;

    // Also act as envelope loop
    lengthHalt: Bit = 0;
    lengthCounter: Uint8 = 0;

    mode: Bit = 0;
    // Timer period
    period: Uint8 = 0;

    envelopeDisable: Bit = 0;
    volume: Uint8 = 0;
    envelopeResetNextClock = false;
    private envelopeCounter = 0;
    private envelopeDivider = 0;

    // The shift register is 15 bits wide
    // On power-up, the shift register is loaded with the value 1
    shiftRegister: Uint16 = 1;
    private timer: Uint8 = 0;

    clock(quarterFrame: boolean, halfFrame: boolean): void {
        if (quarterFrame) {
            // TODO same code as in pulse channel
            // Adjust envelope
            if (this.envelopeResetNextClock) {
                this.envelopeResetNextClock = false;
                this.envelopeCounter = 15;
                this.envelopeDivider = this.volume;
            } else if (this.envelopeDivider === 0) {
                this.envelopeDivider = this.volume;

                if (this.lengthHalt && this.envelopeCounter === 0) {
                    this.envelopeCounter = 15;
                } else if (this.envelopeCounter !== 0) {
                    this.envelopeCounter--;
                }
            } else {
                this.envelopeDivider--;
            }
        }

        if (halfFrame) {
            // TODO same code as in all things with length counter
            if (this.lengthCounter && !this.lengthHalt) {
                this.lengthCounter--;
            }
        }

        if (this.timer) {
            this.timer--;
        } else {
            this.timer = this.period;
            // TODO this.mode * 5 + 1?
            const offset = this.mode ? 6 : 1;
            const feedback = (this.shiftRegister & Constants.BIT_1) ^ ((this.shiftRegister >>> offset) & Constants.BIT_1);
            this.shiftRegister = (this.shiftRegister >>> 1) | (feedback << 14);
        }

        //The mixer receives the current envelope volume except when:
        // * TODO Bit 0 of the shift register is set, or
        // * The length counter is zero
        if (this.lengthCounter) {
            this.outputVolume = this.envelopeDisable ? this.volume : this.envelopeCounter;
        } else {
            this.outputVolume = 0;
        }
    }
}
