import {CpuBus} from './cpu-bus';
import {Cpu} from './cpu';
import {Ppu, ScreenInterface} from './ppu';
import {Cartridge} from './cartridge';
import {ControllerInterface} from './controller';

/*
 * Main NES class
 */

const enum NesConstants {
    CPU_CLOCK_PERIOD = 3,
    MASTER_CLOCK_SPEED_MILLIHZ = 21477272 / 1000,
    PPU_CLOCK_SPEED_MILLIHZ = NesConstants.MASTER_CLOCK_SPEED_MILLIHZ / 4
}

interface Options {
    screenInterface?: ScreenInterface,
    controller1Interface?: ControllerInterface,
    controller2Interface?: ControllerInterface
}

class Nes {
    readonly cpu: Cpu;
    readonly ppu: Ppu;
    readonly bus: CpuBus;

    private cycle = 0;
    private previousAnimationFrame = -1;

    private oamDmaInitialized = false;

    constructor(cartridge: Cartridge, options: Options = {}) {
        this.ppu = new Ppu(cartridge, options.screenInterface);
        this.bus = new CpuBus(cartridge, this.ppu, options.controller1Interface, options.controller2Interface);
        this.cpu = new Cpu(this.bus);
        this.reset();
    }

    get isRunning(): boolean {
        return this.previousAnimationFrame !== -1;
    }

    getCycle(): number {
        return this.cycle;
    }

    reset(): void {
        this.cycle = 0;
        this.cpu.reset();
        this.ppu.reset();
        this.stepOperation();
    }

    stepOperation(): void {
        while (!this.cpuWillBeClocked) {
            this.clock();
        }

        this.clock();

        while (this.cpu.remainingCycles !== 0) {
            this.clock();
        }
    }

    run(): void {
        if (this.isRunning) {
            return;
        }

        this.previousAnimationFrame = performance.now();
        this.runAutoClock();
    }

    pause(): void {
        this.previousAnimationFrame = -1;
    }

    private clock(): void {
        // TODO why we clock ppu first? Cpu can change ppu state at clock. So it is kinda unstable?
        this.ppu.clock();

        if (this.cpuWillBeClocked) {
            // TODO Cpu & Ppu sync state here mb we can incapsulate it better
            if (this.bus.isOamDmaTransfer) {
                if (!this.oamDmaInitialized) {
                    // We need to wait odd cycle to start oam dma
                    this.oamDmaInitialized = this.cycle % 2 === 1;
                } else if (this.cycle % 2 === 1) {
                    // On odd clock we write
                    this.ppu.writeOam(this.bus.getOamDmaOffset(), this.bus.getOamDmaByte());
                    if (!this.bus.progressOamDmaTransfer()) {
                        this.oamDmaInitialized = false;
                    }
                }
            } else {
                this.cpu.clock();
            }
        }

        if (this.ppu.isNmiRequested) {
            this.cpu.nmi();
            this.ppu.clearNmiFlag();
        }

        this.cycle++;
    }

    private runAutoClock = (carry = 0): void => {
        if (!this.isRunning) {
            return;
        }

        // TODO if time distance is large then pause emulator

        const time = performance.now();
        const diff = time - this.previousAnimationFrame;
        const rawClockNumber = NesConstants.PPU_CLOCK_SPEED_MILLIHZ * diff + carry;
        const clockNumber = Math.floor(rawClockNumber);
        const nextCarry = rawClockNumber - clockNumber;
        for (let i = 0; i < clockNumber; i++) {
            this.clock();
        }
        this.previousAnimationFrame = time;
        requestAnimationFrame(() => this.runAutoClock(nextCarry));
    }

    private get cpuWillBeClocked(): boolean {
        return this.cycle % NesConstants.CPU_CLOCK_PERIOD === 0;
    }
}

export {Nes}
