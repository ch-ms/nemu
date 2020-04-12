import {CpuBus, CpuBusState} from './cpu-bus';
import {Cpu, CpuState} from './cpu';
import {Ppu, ScreenInterface, PpuState} from './ppu';
import {Apu} from './apu';
import {AudioGraph} from './audio-graph';
import {Cartridge, CartridgeState} from './cartridge';
import {ControllerInterface} from './controller';

/*
 * Main NES class
 */

export const enum Timings {
    PPU_CLOCK_PER_CPU_CLOCK = 3,
    APU_CLOCK_PER_PPU_CLOCK = 6,

    MASTER_CLOCK_HZ = 21477272,
    PPU_CLOCK_HZ = Timings.MASTER_CLOCK_HZ / 4,
    PPU_CLOCK_MILLIHZ = PPU_CLOCK_HZ / 1000,
    CPU_CLOCK_HZ = Timings.PPU_CLOCK_HZ / Timings.PPU_CLOCK_PER_CPU_CLOCK,
}

interface Options {
    screenInterface?: ScreenInterface;
    controller1Interface?: ControllerInterface;
    controller2Interface?: ControllerInterface;
    state?: NesState;
}

export interface NesState {
    cpu: CpuState;
    ppu: PpuState;
    cpuBus: CpuBusState;
    cartridge: CartridgeState;
}

class Nes {
    readonly cpu: Cpu;
    readonly ppu: Ppu;
    readonly bus: CpuBus;
    readonly apu: Apu;
    readonly audioGraph?: AudioGraph;

    private cycle = 0;
    private previousAnimationFrame = -1;

    private oamDmaInitialized = false;

    constructor(
        private readonly cartridge: Cartridge,
        options: Options = {}
    ) {
        this.ppu = new Ppu(
            this.cartridge,
            options.screenInterface,
            options.state ? options.state.ppu : undefined
        );
        if (typeof window !== 'undefined') {
            this.audioGraph = new AudioGraph();
        }
        this.apu = new Apu(this.audioGraph);
        this.bus = new CpuBus(
            this.cartridge,
            this.ppu,
            this.apu,
            options.controller1Interface,
            options.controller2Interface,
            options.state ? options.state.cpuBus : undefined
        );
        this.cpu = new Cpu(this.bus, options.state ? options.state.cpu : undefined);

        if (!options.state) {
            this.reset();
        }
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

        this.audioGraph && this.audioGraph.resume();
        this.previousAnimationFrame = performance.now();
        this.runAutoClock();
    }

    pause(): void {
        this.audioGraph && this.audioGraph.suspend();
        this.previousAnimationFrame = -1;
    }

    serialize(): NesState {
        return {
            cpu: this.cpu.serialize(),
            ppu: this.ppu.serialize(),
            cpuBus: this.bus.serialize(),
            cartridge: this.cartridge.serialize()
        };
    }

    private clock(): void {
        // TODO why we clock ppu first? Cpu can change ppu state at clock. So it is kinda unstable?
        this.ppu.clock();

        if (this.cycle % Timings.APU_CLOCK_PER_PPU_CLOCK === 0) {
            this.apu.clock();
        }

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
        const rawClockNumber = Timings.PPU_CLOCK_MILLIHZ * diff + carry;
        const clockNumber = Math.floor(rawClockNumber);
        const nextCarry = rawClockNumber - clockNumber;
        for (let i = 0; i < clockNumber; i++) {
            this.clock();
        }
        this.previousAnimationFrame = time;
        requestAnimationFrame(() => this.runAutoClock(nextCarry));
    }

    private get cpuWillBeClocked(): boolean {
        return this.cycle % Timings.PPU_CLOCK_PER_CPU_CLOCK === 0;
    }

    static fromSerializedState(state: NesState, options: Options = {}): Nes {
        const cartridge = Cartridge.fromSerializedState(state.cartridge);
        return new Nes(cartridge, options ? {...options, state} : {state});
    }
}

export {Nes};
