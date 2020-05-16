import {Clock} from './clock';
import {Apu} from './apu';
import {Timings} from './nes';

const enum AudioClockConstants {
    // Less value gives more accurate emulation but can be slow
    BUFFER_SIZE = 512,
}

export const enum ChannelParams {
    PULSE_1_PERIOD,
    PULSE_1_VOLUME,
    PULSE_1_DUTY,

    PULSE_2_PERIOD,
    PULSE_2_VOLUME,
    PULSE_2_DUTY,

    TRIANGLE_PERIOD,

    NOISE_VALUE,
    NOISE_VOLUME
}

export class AudioClock implements Clock {
    readonly context: AudioContext;

    // TODO ScriptProcessorNode is deprecated
    private readonly processor: ScriptProcessorNode;
    private readonly ticksPerSample: number;

    constructor(
        private readonly apu: Apu,
        private readonly tick: () => void
    ) {
        this.context = new (window as any).AudioContext();

        this.processor = this.context.createScriptProcessor(AudioClockConstants.BUFFER_SIZE, 1, 9);
        this.ticksPerSample = Timings.PPU_CLOCK_HZ / this.context.sampleRate;

        this.context.audioWorklet.addModule('../build/src/audio-processor.js')
            .then(() => {
                const worklet = new AudioWorkletNode(this.context, 'audio-processor');
                this.processor.onaudioprocess = this.onProcess;
                this.processor.connect(worklet);
                worklet.connect(this.context.destination);
            });
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
        const pulse1Period = e.outputBuffer.getChannelData(ChannelParams.PULSE_1_PERIOD);
        const pulse1Volume = e.outputBuffer.getChannelData(ChannelParams.PULSE_1_VOLUME);
        const pulse1Duty = e.outputBuffer.getChannelData(ChannelParams.PULSE_1_DUTY)

        const pulse2Period = e.outputBuffer.getChannelData(ChannelParams.PULSE_2_PERIOD);
        const pulse2Volume = e.outputBuffer.getChannelData(ChannelParams.PULSE_2_VOLUME);
        const pulse2Duty = e.outputBuffer.getChannelData(ChannelParams.PULSE_2_DUTY);

        const noiseValue = e.outputBuffer.getChannelData(ChannelParams.NOISE_VALUE);
        const noiseVolume = e.outputBuffer.getChannelData(ChannelParams.NOISE_VOLUME);

        const trianglePeriod = e.outputBuffer.getChannelData(ChannelParams.TRIANGLE_PERIOD);
        for (let i = 0; i < AudioClockConstants.BUFFER_SIZE; i++) {
            // TODO mb we can just compute mean of all sample values and sample once?
            for (let j = 0; j < this.ticksPerSample; j++) {
                this.tick();
            }

            if (this.apu.pulse1.length && !this.apu.pulse1.sweepMute && this.apu.pulse1.outputVolume) {
                pulse1Period[i] = this.apu.pulse1.period;
                pulse1Volume[i] = this.apu.pulse1.outputVolume;
                pulse1Duty[i] = this.apu.pulse1.duty;
            } else {
                pulse1Period[i] = 0;
            }

            if (this.apu.pulse2.length && !this.apu.pulse2.sweepMute && this.apu.pulse2.outputVolume) {
                pulse2Period[i] = this.apu.pulse2.period;
                pulse2Volume[i] = this.apu.pulse2.outputVolume;
                pulse2Duty[i] = this.apu.pulse2.duty;
            } else {
                pulse2Period[i] = 0;
            }

            if (this.apu.triangle.lengthCounter && this.apu.triangle.linearCounter && this.apu.triangle.period > 2) {
                trianglePeriod[i] = this.apu.triangle.period;
            } else {
                trianglePeriod[i] = 0;
            }

            if (this.apu.noise.lengthCounter && this.apu.noise.outputVolume) {
                noiseValue[i] = this.apu.noise.shiftRegister;
                noiseVolume[i] = this.apu.noise.outputVolume;
            } else {
                noiseValue[i] = 0;
            }
        }
    }
}
