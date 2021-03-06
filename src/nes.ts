import {CpuBus, CpuBusState} from './cpu-bus';
import {Cpu, CpuState} from './cpu';
import {Ppu, ScreenInterface, PpuState} from './ppu';
import {Apu} from './apu';
import {Clock} from './clock';
import {AudioClock} from './audio-clock';
import {RafClock} from './raf-clock';
import {Cartridge, CartridgeState} from './cartridge';
import {GamepadInterface} from './gamepad';
import {Bit} from './numbers';

/*
 * Main NES class
 */

export const enum Timings {
    CPU_CLOCK_PER_PPU_CLOCK = 3,
    APU_CLOCK_PER_PPU_CLOCK = 6,

    MASTER_CLOCK_HZ = 21477272,
    PPU_CLOCK_HZ = Timings.MASTER_CLOCK_HZ / 4,
    PPU_CLOCK_MILLIHZ = PPU_CLOCK_HZ / 1000,
    CPU_CLOCK_HZ = Timings.PPU_CLOCK_HZ / Timings.CPU_CLOCK_PER_PPU_CLOCK,
    APU_CLOCK_HZ = Timings.PPU_CLOCK_HZ / Timings.APU_CLOCK_PER_PPU_CLOCK
}

interface Options {
    screenInterface?: ScreenInterface;
    gamepad1Interface?: GamepadInterface;
    gamepad2Interface?: GamepadInterface;
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

    readonly clock: Clock;

    private cycle = 0;
    private cpuWillBeClocked = true;

    private oamDmaInitialized: Bit = 0;

    constructor(
        private readonly cartridge: Cartridge,
        options: Options = {}
    ) {
        this.ppu = new Ppu(
            this.cartridge,
            options.screenInterface,
            options.state ? options.state.ppu : undefined
        );

        this.apu = new Apu();
        if (typeof window !== 'undefined' && typeof (window as any).AudioContext !== 'undefined') {
            this.clock = new AudioClock(this.apu, this.tick);
        } else {
            this.clock = new RafClock(this.tick);
        }

        this.bus = new CpuBus(
            this.cartridge,
            this.ppu,
            this.apu,
            options.gamepad1Interface,
            options.gamepad2Interface,
            options.state ? options.state.cpuBus : undefined
        );
        this.cpu = new Cpu(this.bus, options.state ? options.state.cpu : undefined);

        if (!options.state) {
            this.reset();
        }
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
            this.tick();
        }

        this.tick();

        while (this.cpu.remainingCycles !== 0) {
            this.tick();
        }
    }

    run(): void {
        this.clock.resume();
    }

    pause(): void {
        this.clock.suspend();
    }

    serialize(): NesState {
        return {
            cpu: this.cpu.serialize(),
            ppu: this.ppu.serialize(),
            cpuBus: this.bus.serialize(),
            cartridge: this.cartridge.serialize()
        };
    }

    private tick = (times = 1): void => {
        while (times--) {
            // TODO why we clock ppu first? Cpu can change ppu state at clock. So it is kinda unstable?
            this.ppu.clock();

            if (this.cycle % Timings.APU_CLOCK_PER_PPU_CLOCK === 0) {
                this.apu.clock();
            }

            if (this.cpuWillBeClocked) {
                // TODO Cpu & Ppu sync state here mb we can incapsulate it better
                if (this.bus.isOamDmaTransfer) {
                    const isOdd = (this.cycle & 1) as Bit;
                    if (!this.oamDmaInitialized) {
                        // We need to wait odd cycle to start oam dma
                        this.oamDmaInitialized = isOdd;
                    } else if (isOdd) {
                        // On odd clock we write
                        this.ppu.oam[this.bus.getOamDmaOffset()] = this.bus.getOamDmaByte();
                        if (!this.bus.progressOamDmaTransfer()) {
                            this.oamDmaInitialized = 0;
                        }
                    }
                } else {
                    this.cpu.clock();
                }
            }

            if (this.ppu.nmiRequestFlag) {
                this.cpu.nmi();
                this.ppu.nmiRequestFlag = false;
            }

            this.cycle++;
            this.cpuWillBeClocked = this.cycle % Timings.CPU_CLOCK_PER_PPU_CLOCK === 0;
        }
    }

    static fromSerializedState(state: NesState, options: Options = {}): Nes {
        const cartridge = Cartridge.fromSerializedState(state.cartridge);
        return new Nes(cartridge, options ? {...options, state} : {state});
    }
}

export {Nes};
