import {Uint16, Uint8, Bit} from './numbers';

class TriangleChannel {
    enable: Bit = 0;
    output: number = 0;

    // Translated to frequency
    period: Uint16 = 0;

    // control bit also act as a length counter halt
    control: Bit = 0;

    lengthCounter: Uint8 = 0;

    linearCounterReload: Uint8 = 0;
    linearCounterReloadFlag = false;
    linearCounter = 0;

    private frequency = 0;
    private timer = 0;
    private sampleIndex = 0;
    private sampleDirection = -1;
    private sampleCounter = 15;

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

        if (this.timer) {
            this.timer--;
        } else {
            this.timer = this.period;
            this.output = this.sampleCounter;

            this.sampleCounter += this.sampleDirection;

            // TODO maybe array look up would perform better?
            // Sample cycle like this 15 .. 0, 0 .. 15
            if (this.sampleCounter < 0) {
                this.sampleCounter = 0;
                this.sampleDirection = 1;
            } else if (this.sampleCounter > 15) {
                this.sampleCounter = 15;
                this.sampleDirection = -1;
            }
        }
    }
}

export {TriangleChannel};
