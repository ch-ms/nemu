import {Uint16, Uint8, Bit} from './numbers';
import {Timings} from './nes';
import {AudioGraph} from './audio-graph'

class TriangleChannel {
    enable: Bit = 0;

    // Translated to frequency
    timer: Uint16 = 0;

    // control bit also act as a length counter halt
    control: Bit = 0;

    lengthCounter: Uint8 = 0;

    linearCounterReload: Uint8 = 0;
    linearCounterReloadFlag = false;
    private linearCounter = 0;

    private frequency = 0;

    constructor(
        private readonly graph?: AudioGraph
    ) {
    }

    clock(quarterFrame: boolean, halfFrame: boolean): void {
        if (quarterFrame) {
            if (this.linearCounterReloadFlag) {
                this.linearCounter = this.linearCounterReload;
            } else if (this.linearCounter !== 0) {
                this.linearCounter--;
            }

            if (!this.control) {
                this.linearCounterReloadFlag = false;
            }
        }

        if (halfFrame) {
            if (this.lengthCounter && !this.control) {
                this.lengthCounter--;
            }
        }

        // Set output values
        if (!this.graph) {
            return;
        }

        // this.timer > 2 halts channel at ultrasonic values
        if (this.lengthCounter && this.linearCounter && this.timer > 2) {
            const frequency = Timings.CPU_CLOCK_HZ / (32 * (this.timer + 1));
            if (this.frequency !== frequency) {
                this.frequency = frequency;
                this.graph.triangle.frequency.value = frequency;
            }

            this.graph.toggleTriangle(true);
        } else {
            this.graph.toggleTriangle(false);
        }
    }
}

export {TriangleChannel};
