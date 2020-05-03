import {Timings} from './nes';
import {Clock} from './clock';
import {Apu} from './apu';
import {Constants} from './constants';
import {DutyCycle} from './pulse-channel';

const enum AudioClockConstants {
    MAX_VOLUME = 15,
    // Less value gives more accurate emulation but can be slow
    BUFFER_SIZE = 512,
    PULSE_HARMONICS = 17,
    TRIANGLE_HARMONICS = 10,

    // Linear approximation with volume normalization
    // http://wiki.nesdev.com/w/index.php/APU_Mixer
    // (0.00752 * (pulse1 + pulse2) + 0.00851 * triangle * 15 + 0.00494 * noise + 0.00335 * dmc) / 15
    PULSE_COEF = 0.00752 / AudioClockConstants.MAX_VOLUME,
    TRIANGLE_COEF = 0.00851,
    NOISE_COEF = 0.00494 / AudioClockConstants.MAX_VOLUME
}

const TWO_PI = Math.PI * 2;
const TWO_OVER_PI = 2 / Math.PI;
const EIGHT_OVER_PI_2 = 8 / (Math.PI ** 2);

/**
 * Cubic sin approximation
 */
function approxSin(x: number): number {
    let j = x * 0.15915;
    j = j - (j | 0);
    return 20.785 * j * (j - 0.5) * (j - 1);
}

// TODO if we change duty cycle amplitude is also slighty change so we need to account for it
function samplePulseWave(time: number, frequency: number, duty: DutyCycle): number {
    let a = 0;
    let b = 0;
    const p = duty * TWO_PI;
    const t = time * frequency * TWO_PI;
    for (let i = 1; i < AudioClockConstants.PULSE_HARMONICS + 1; i++) {
        const c = t * i;
        a += -approxSin(c) / i;
        b += -approxSin(c - p * i) / i;
    }

    return TWO_OVER_PI * (a - b);
}

// Precompute bunch of coefficients for sampleTriangleWave
const [SAMPLE_TRIANGLE_N_LOOKUP, SAMPLE_TRIANGLE_C_LOOKUP] = (function(): [number[], number[]] {
    const n = [];
    const c = [];

    for (let i = 0; i < AudioClockConstants.TRIANGLE_HARMONICS; i++) {
        const a = 2 * i + 1;
        n.push(a);
        c.push(((-1) ** i) * (a ** -2));
    }

    return [n, c];
})();

function sampleTriangleWave(time: number, frequency: number): number {
    let output = 0;
    const a = TWO_PI * frequency * time;
    for (let i = 0; i < AudioClockConstants.TRIANGLE_HARMONICS; i++) {
        output += SAMPLE_TRIANGLE_C_LOOKUP[i] * approxSin(a * SAMPLE_TRIANGLE_N_LOOKUP[i]);
    }

    return EIGHT_OVER_PI_2 * output;
}

export class AudioClock implements Clock {
    readonly context: AudioContext;
    // TODO ScriptProcessorNode is deprecated
    private readonly processor: ScriptProcessorNode;
    private readonly ticksPerSample: number;
    private readonly timePerSample: number;

    constructor(
        private readonly apu: Apu,
        private readonly tick: () => void
    ) {
        this.context = new (window as any).AudioContext();
        this.processor = this.context.createScriptProcessor(AudioClockConstants.BUFFER_SIZE, 1, 1);
        this.processor.connect(this.context.destination);
        this.processor.onaudioprocess = this.onProcess;

        this.ticksPerSample = Timings.PPU_CLOCK_HZ / this.context.sampleRate;
        this.timePerSample = 1 / this.context.sampleRate;
    }

    get isRunning(): boolean {
        return this.context.state === 'running';
    }

    resume(): void {
        if (!this.isRunning) {
            this.context.resume();
        }
    }

    suspend(): void {
        if (this.isRunning) {
            this.context.suspend();
        }
    }

    private onProcess = (e: AudioProcessingEvent): void => {
        let time = e.playbackTime;
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < AudioClockConstants.BUFFER_SIZE; i++) {
            // TODO mb we can just compute mean of all sample values and sample once?
            for (let j = 0; j < this.ticksPerSample; j++) {
                this.tick();
            }
            time += this.timePerSample;

            let pulse1Sample = 0;
            if (this.apu.pulse1.length && !this.apu.pulse1.sweepMute && this.apu.pulse1.outputVolume) {
                const pulse1Frequency = Timings.CPU_CLOCK_HZ / (16 * (this.apu.pulse1.period + 1));
                pulse1Sample = samplePulseWave(time, pulse1Frequency, this.apu.pulse1.duty) * this.apu.pulse1.outputVolume;
            }

            let pulse2Sample = 0;
            if (this.apu.pulse2.length && !this.apu.pulse2.sweepMute && this.apu.pulse2.outputVolume) {
                const pulse2Frequency = Timings.CPU_CLOCK_HZ / (16 * (this.apu.pulse2.period + 1));
                pulse2Sample = samplePulseWave(time, pulse2Frequency, this.apu.pulse2.duty) * this.apu.pulse2.outputVolume;
            }

            let triangleSample = 0;
            // period > 2 halts channel at ultrasonic values
            if (this.apu.triangle.lengthCounter && this.apu.triangle.linearCounter && this.apu.triangle.period > 2) {
                const triangleFrequency = Timings.CPU_CLOCK_HZ / (32 * (this.apu.triangle.period + 1));
                triangleSample = sampleTriangleWave(time, triangleFrequency);
            }

            let noiseSample = 0;
            if (this.apu.noise.lengthCounter && this.apu.noise.outputVolume) {
                // All waves are between -1 and +1, but noise is between 0 and 1, so scale it
                noiseSample = ((this.apu.noise.shiftRegister & Constants.BIT_1) * 2 - 1) * this.apu.noise.outputVolume;
            }

            // See coef's definition for more information
            output[i] = AudioClockConstants.PULSE_COEF * (pulse1Sample + pulse2Sample) +
                AudioClockConstants.TRIANGLE_COEF * triangleSample + AudioClockConstants.NOISE_COEF * noiseSample;
        }
    }
}
