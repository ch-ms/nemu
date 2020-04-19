import {Uint16, Uint8, Bit} from './numbers';
import {Constants} from './constants';
import {AudioGraph} from './audio-graph';
import {Timings} from './nes';

const enum NoiseConstants {
    MAX_VOLUME = 0xf
}

export class NoiseChannel {
    enable: Bit = 0;

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
    private shiftRegister: Uint16 = 1;
    private timer: Uint8 = 0;
    private outputVolume = 0;

    constructor(private readonly graph?: AudioGraph) {
        if (this.graph) {
            this.graph.noise.onaudioprocess = this.onProcess.bind(this);
        }
    }

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


        // Set output value
        if (!this.graph) {
            return;
        }

        let volume = 0;
        //The mixer receives the current envelope volume except when:
        // * TODO Bit 0 of the shift register is set, or
        // * The length counter is zero
        if (this.lengthCounter) {
            volume = this.envelopeDisable ? this.volume : this.envelopeCounter;
        }

        if (volume !== this.outputVolume) {
            this.outputVolume = volume;
            this.graph.noiseVolume.gain.value = this.outputVolume / NoiseConstants.MAX_VOLUME;
        }
    }

    private onProcess(e: AudioProcessingEvent): void {
        const clocksPerSample = Timings.APU_CLOCK_HZ / e.outputBuffer.sampleRate;
        const wholeClocksPerSample = clocksPerSample | 0;
        const leftover = clocksPerSample - wholeClocksPerSample;
        let leftoverCounter = 0;
        const output = e.outputBuffer.getChannelData(0);
        const offset = this.mode ? 6 : 1;
        for (let i = 0; i < output.length; i++) {
            let clocks = clocksPerSample;

            leftoverCounter += leftover;
            // Perform additional clock if leftoverCounter overflow
            if (leftoverCounter > 1) {
                clocks += 1;
                leftoverCounter -= 1;
            }

            let value = this.shiftRegister & Constants.BIT_1;
            for (let j = 0; j < clocks; j++) {
                if (this.timer) {
                    this.timer--;
                } else {
                    this.timer = this.period;
                    const feedback = (this.shiftRegister & Constants.BIT_1) ^ ((this.shiftRegister >>> offset) & Constants.BIT_1);
                    this.shiftRegister = (this.shiftRegister >>> 1) | (feedback << 14);
                }
                // Average all values
                value = (value + (this.shiftRegister & Constants.BIT_1)) * 0.5;
            }

            // TODO proper outputVolume
            output[i] = value * (this.outputVolume - 1) / 16;
        }
    }
}
