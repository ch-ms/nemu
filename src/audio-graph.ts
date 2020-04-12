import {PulseWaveOscillator} from './pulse-wave-oscillator';

/**
 * Presents all nes audio channels in a web audio graph
 */
class AudioGraph {
    readonly pulseWave1: PulseWaveOscillator;
    readonly pulseWave2: PulseWaveOscillator;
    readonly triangle: OscillatorNode;
    readonly volume: GainNode;

    private readonly audioCtx: AudioContext;
    private triangleOn = false;
    private readonly triangleOutput: GainNode;

    constructor() {
        this.audioCtx = new (window as any).AudioContext();
        this.pulseWave1 = new PulseWaveOscillator(this.audioCtx);
        this.pulseWave2 = new PulseWaveOscillator(this.audioCtx);
        this.triangle = this.audioCtx.createOscillator();
        this.volume = this.audioCtx.createGain();

        this.triangle.frequency.value = 0;

        this.pulseWave1.output.connect(this.volume);
        this.pulseWave2.output.connect(this.volume);

        this.triangleOutput = this.audioCtx.createGain();
        this.triangle.connect(this.triangleOutput);
        this.triangleOutput.connect(this.volume);

        this.volume.connect(this.audioCtx.destination);

        this.volume.gain.value = 0.1
        this.triangle.start();
    }

    resume(): void {
        this.audioCtx.resume();
    }

    suspend(): void {
        this.audioCtx.suspend();
    }

    toggleTriangle(on: boolean): void {
        if (on === this.triangleOn) {
            return;
        }

        this.triangleOutput.gain.value = on ? 1 : 0;
        this.triangleOn = on;
    }
}

export {AudioGraph};
