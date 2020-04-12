import {DutyCycle} from './pulse-channel';

/**
 * Pulse wave is a square wave for which we can change duty cycle
 * https://en.wikipedia.org/wiki/Pulse_wave
 */
class PulseWaveOscillator {
    readonly output: GainNode;
    readonly volume: GainNode;

    private oscillator1: OscillatorNode;
    private oscillator2: OscillatorNode;
    private delay: DelayNode;
    private isStarted = false;

    constructor(
        audioCtx: AudioContext,
        private dutyCycle: DutyCycle = 0.5,
        private frequency = 0
    ) {
        this.output = audioCtx.createGain();
        this.volume = audioCtx.createGain();
        this.oscillator1 = audioCtx.createOscillator();
        this.oscillator2 = audioCtx.createOscillator();
        const inverter = audioCtx.createGain();
        this.delay = audioCtx.createDelay();

        this.setFrequencyAndDutyCycle(this.frequency, this.dutyCycle);

        this.oscillator1.type = this.oscillator2.type = 'sawtooth';
        inverter.gain.value = -1;

        this.oscillator1.connect(this.volume);

        this.oscillator2.connect(inverter);
        inverter.connect(this.delay);
        this.delay.connect(this.volume);

        this.volume.connect(this.output);

        this.oscillator1.start();
        this.oscillator2.start();
    }

    setFrequencyAndDutyCycle(frequency: number, dutyCycle: DutyCycle): void {
        if (frequency === this.frequency && dutyCycle === this.dutyCycle) {
            return;
        }

        if (frequency !== this.frequency) {
            this.frequency = frequency;
            this.oscillator1.frequency.value = this.frequency;
            this.oscillator2.frequency.value = this.frequency;
        }

        this.dutyCycle = dutyCycle;
        this.delay.delayTime.value = this.frequency ?
            this.dutyCycle / this.frequency :
            0;
    }

    start(): void {
        if (this.isStarted) {
            return;
        }

        this.output.gain.value = 1;
        this.isStarted = true;
    }

    stop(): void {
        if (!this.isStarted) {
            return;
        }

        this.output.gain.value = 0;
        this.isStarted = false;
    }
}

export {PulseWaveOscillator};
