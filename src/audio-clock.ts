import {Timings} from './nes';
import {Clock} from './clock';

const enum AudioClockConstants {
    // Less value gives more accurate emulation but can be slow
    BUFFER_SIZE = 512
}

export class AudioClock implements Clock {
    readonly context: AudioContext;
    // TODO ScriptProcessorNode is deprecated
    private readonly processor: ScriptProcessorNode;
    private readonly ticksPerProcess: number;

    constructor(
        private readonly tick: () => void
    ) {
        this.context = new (window as any).AudioContext();
        this.processor = this.context.createScriptProcessor(AudioClockConstants.BUFFER_SIZE, 1, 1);
        this.processor.connect(this.context.destination);
        this.processor.onaudioprocess = this.onProcess;

        const ticksPerSample = Timings.PPU_CLOCK_HZ / this.context.sampleRate;
        // We loose some precision here by dropping carry, but it is not affect gameplay that much
        this.ticksPerProcess = (AudioClockConstants.BUFFER_SIZE * ticksPerSample) | 0;
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

    private onProcess = (): void => {
        for (let i = 0; i < this.ticksPerProcess; i++) {
            this.tick();
        }
    }
}
