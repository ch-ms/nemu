import {Timings} from './nes';
import {Clock} from './clock';

export class RafClock implements Clock {
    private previousAnimationFrame = -1;

    constructor(private readonly tick: () => void) {
    }

    get isRunning(): boolean {
        return this.previousAnimationFrame !== -1;
    }

    resume(): void {
        if (!this.isRunning) {
            this.previousAnimationFrame = performance.now();
            this.runAutoClock();
        }
    }

    suspend(): void {
        if (this.isRunning) {
            this.previousAnimationFrame = -1;
        }
    }

    // TODO can rewrite it for using params but this is actually slower :(
    // runAutoClock(current: time, previous: time, carry: 0)
    private runAutoClock(carry = 0): void {
        if (!this.isRunning) {
            return;
        }

        // TODO if time distance is large then pause emulator
        const time = performance.now();
        const diff = time - this.previousAnimationFrame;
        const rawClockNumber = Timings.PPU_CLOCK_MILLIHZ * diff + carry;
        const clockNumber = rawClockNumber | 0;
        const nextCarry = rawClockNumber - clockNumber;
        for (let i = 0; i < clockNumber; i++) {
            this.tick();
        }
        this.previousAnimationFrame = time;
        requestAnimationFrame(() => this.runAutoClock(nextCarry));
    }
}
