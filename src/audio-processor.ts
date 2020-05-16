import {Timings} from './nes';
import {ChannelParams} from './audio-clock';
import {DutyCycle} from './pulse-channel';
import {Constants} from './constants';

// Typescript does not have definitions for AudioWorkletProcessor
// https://github.com/Microsoft/TypeScript/issues/28308
interface AudioWorkletProcessor {
    readonly port: MessagePort;
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): void;
}

declare var AudioWorkletProcessor: {
    prototype: AudioWorkletProcessor;
    new(options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
}

type AudioWorkletClass = new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor;

declare var registerProcessor: (name: string, processor: AudioWorkletClass) => void;
declare var sampleRate: number;
declare var currentTime: number;

const TWO_PI = Math.PI * 2;
const TWO_OVER_PI = 2 / Math.PI;
const EIGHT_OVER_PI_2 = 8 / (Math.PI ** 2);
const TIME_PER_SAMPLE = 1 / sampleRate;

const enum AudioProcessorConstants {
    PULSE_HARMONICS = 17,
    TRIANGLE_HARMONICS = 10,

    MAX_VOLUME = 15,

    // Linear approximation with volume normalization
    // http://wiki.nesdev.com/w/index.php/APU_Mixer
    // (0.00752 * (pulse1 + pulse2) + 0.00851 * triangle * 15 + 0.00494 * noise + 0.00335 * dmc) / 15
    PULSE_COEF = 0.00752 / AudioProcessorConstants.MAX_VOLUME,
    TRIANGLE_COEF = 0.00851,
    NOISE_COEF = 0.00494 / AudioProcessorConstants.MAX_VOLUME
}

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
    for (let i = 1; i < AudioProcessorConstants.PULSE_HARMONICS + 1; i++) {
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

    for (let i = 0; i < AudioProcessorConstants.TRIANGLE_HARMONICS; i++) {
        const a = 2 * i + 1;
        n.push(a);
        c.push(((-1) ** i) * (a ** -2));
    }

    return [n, c];
})();

function sampleTriangleWave(time: number, frequency: number): number {
    let output = 0;
    const a = TWO_PI * frequency * time;
    for (let i = 0; i < AudioProcessorConstants.TRIANGLE_HARMONICS; i++) {
        output += SAMPLE_TRIANGLE_C_LOOKUP[i] * approxSin(a * SAMPLE_TRIANGLE_N_LOOKUP[i]);
    }

    return EIGHT_OVER_PI_2 * output;
}

class AudioProcessor extends AudioWorkletProcessor {
    process(inputs: Float32Array[][], outputs: Float32Array[][]): true {
        let time = currentTime;

        const inputSize = inputs[0][0].length;

        const pulse1Period = inputs[0][ChannelParams.PULSE_1_PERIOD];
        const pulse1Volume = inputs[0][ChannelParams.PULSE_1_VOLUME];
        const pulse1Duty = inputs[0][ChannelParams.PULSE_1_DUTY];

        const pulse2Period = inputs[0][ChannelParams.PULSE_2_PERIOD];
        const pulse2Volume = inputs[0][ChannelParams.PULSE_2_VOLUME];
        const pulse2Duty = inputs[0][ChannelParams.PULSE_2_DUTY];

        const trianglePeriod = inputs[0][ChannelParams.TRIANGLE_PERIOD];

        const noiseValue = inputs[0][ChannelParams.NOISE_VALUE];
        const noiseVolume = inputs[0][ChannelParams.NOISE_VOLUME];

        const output = outputs[0][0];

        for (let i = 0; i < inputSize; i++) {
            let pulse1Sample = 0;
            if (pulse1Period[i]) {
                const frequency = Timings.CPU_CLOCK_HZ / (16 * (pulse1Period[i] + 1));
                pulse1Sample = samplePulseWave(time, frequency, pulse1Duty[i]) * pulse1Volume[i];
            }

            let pulse2Sample = 0;
            if (pulse2Period[i]) {
                const frequency = Timings.CPU_CLOCK_HZ / (16 * (pulse2Period[i] + 1));
                pulse2Sample = samplePulseWave(time, frequency, pulse2Duty[i]) * pulse2Volume[i];
            }

            let triangleSample = 0;
            if (trianglePeriod[i]) {
                const triangleFrequency = Timings.CPU_CLOCK_HZ / (32 * (trianglePeriod[i] + 1));
                triangleSample = sampleTriangleWave(time, triangleFrequency);
            }

            let noiseSample = 0;
            if (noiseValue[i]) {
                // All waves are between -1 and +1, but noise is between 0 and 1, so scale it
                noiseSample = ((noiseValue[i] & Constants.BIT_1) * 2 - 1) * noiseVolume[i];
            }

            output[i] = AudioProcessorConstants.PULSE_COEF * (pulse1Sample + pulse2Sample) +
                AudioProcessorConstants.TRIANGLE_COEF * triangleSample + AudioProcessorConstants.NOISE_COEF * noiseSample;

            time += TIME_PER_SAMPLE;
        }

        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
