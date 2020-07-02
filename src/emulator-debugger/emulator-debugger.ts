import {Nes, NesState} from '../nes';
import {Cpu} from '../cpu';
import {ScreenInterface} from '../ppu';
import {GamepadInterface} from '../gamepad';
import {parseCartridge} from '../cartridge-parser';
import {Cartridge} from '../cartridge';
import {cpuStatusToFormattedString} from '../utils/utils';
import {CpuProgramView} from './cpu-program-view';
import {PaletteView} from './palette-view';
import {MemoryView} from './memory-view';
import {PatternView} from './pattern-view';
import {NametableView} from './nametable-view';
import {GamepadSettingsView} from './gamepad-settings-view';
import {OamView} from './oam-view';

import {nestestJson} from '../../data/nestest.nes';
const nestestRom = new Uint8Array(nestestJson).buffer;

const NES_SAVE_STATE_STORAGE_KEY = 'nesSaveState';

class GameSession {
    constructor(readonly nes: Nes) {
    }

    save(): void {
        const state = this.nes.serialize();
        console.log('save', state);
        window.localStorage.setItem(NES_SAVE_STATE_STORAGE_KEY, JSON.stringify(state));
    }

    destroy(): void {
        this.nes.pause();
    }

    static fromSerializedState(
        state: NesState,
        screenInterface: ScreenInterface,
        gamepadInterface: GamepadInterface
    ): GameSession {
        return new GameSession(
            Nes.fromSerializedState(state, {screenInterface, gamepad1Interface: gamepadInterface})
        );
    }

    static fromCartridge(
        cartridge: Cartridge,
        screenInterface: ScreenInterface,
        gamepadInterface: GamepadInterface
    ): GameSession {
        return new GameSession(new Nes(cartridge, {screenInterface, gamepad1Interface: gamepadInterface}));
    }
}

class CpuStatusView {
    constructor(private readonly container: HTMLElement) {
        this.container = container;
    }

    render(cpu: Cpu): void {
        this.container.innerText = cpuStatusToFormattedString(cpu);
    }
}

class EmulatorDebuggerUI {
    private readonly cartridgeFileInput: HTMLInputElement;
    private readonly cpuStatusView: CpuStatusView;
    private readonly cpuProgramView: CpuProgramView;
    private readonly memoryView: MemoryView;
    private readonly paletteView: PaletteView;
    private readonly patternView: PatternView;
    private readonly nametableView: NametableView;
    private readonly gamepadSettingsView: GamepadSettingsView;
    private readonly oamView: OamView;
    private gameSession?: GameSession;

    constructor(private readonly container: HTMLElement) {
        this.cartridgeFileInput = container.querySelector('#cartridge-input') as HTMLInputElement;
        this.cartridgeFileInput.addEventListener('change', () => this.onCartridgeInputChange());

        this.cpuStatusView = new CpuStatusView(this.container.querySelector('.status-explorer') as HTMLElement);
        this.cpuProgramView = new CpuProgramView(this.container.querySelector('.program-explorer') as HTMLElement);

        this.memoryView = new MemoryView(this.container.querySelector('.memory-explorer') as HTMLElement);
        this.memoryView.pageChanged = (): void => this.render();

        this.paletteView = new PaletteView(this.container.querySelector('[data-view=palette]') as HTMLElement);
        this.patternView = new PatternView(this.container.querySelector('[data-view=pattern]') as HTMLElement);
        this.nametableView = new NametableView(this.container.querySelector('[data-view=nametable]') as HTMLElement);
        this.oamView = new OamView(this.container.querySelector('[data-view=oam]') as HTMLElement);
        this.gamepadSettingsView = new GamepadSettingsView(this.container.querySelector('[data-view=gamepad-settings]') as HTMLElement);

        this.container.querySelector('button[name=step-instruction]')!.addEventListener('click', this.onStepInstructionClick);
        this.container.querySelector('button[name=reset]')!.addEventListener('click', this.onResetClick);
        this.container.querySelector('button[name=run]')!.addEventListener('click', this.onRunClick);
        this.container.querySelector('button[name=pause]')!.addEventListener('click', this.onPauseClick);
        this.container.querySelector('button[name=save-state]')!.addEventListener('click', this.onSaveStateClick.bind(this));
        this.container.querySelector('button[name=load-state]')!.addEventListener('click', this.onLoadStateClick.bind(this));

        this.createGameSession(nestestRom);
    }

    private createScreenInterface(): ScreenInterface {
        const canvas = this.container.querySelector('#canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('Error while receiving context from canvas');
        }

        return {
            frameCompleted: (frameBuffer: ImageData): void => {
                ctx.putImageData(frameBuffer, 0, 0);
                this.render();
            }
        };
    }

    private onStepInstructionClick = (): void => {
        if (!this.gameSession) {
            return;
        }

        this.gameSession.nes.stepOperation();
        this.render();
    }

    private onResetClick = (): void => {
        if (!this.gameSession) {
            return;
        }

        this.gameSession.nes.reset();
        this.render();
    }

    private onRunClick = (): void => {
        if (!this.gameSession) {
            return;
        }

        this.gameSession.nes.run();
    }

    private onPauseClick = (): void => {
        if (!this.gameSession) {
            return;
        }

        this.gameSession.nes.pause();
        this.render();
    }

    private onCartridgeInputChange(): void {
        if (!this.cartridgeFileInput.files || this.cartridgeFileInput.files.length === 0) {
            return;
        }

        const file = this.cartridgeFileInput.files[0];
        const fileReader = new FileReader();
        fileReader.onload = (): void => {
            if (!fileReader.result) {
                throw new Error(`Error while loading file`);
            }

            this.createGameSession(fileReader.result as ArrayBuffer);
        };
        fileReader.readAsArrayBuffer(file);
    }

    private onSaveStateClick(): void {
        if (!this.gameSession) {
            throw new Error(`There is no game session`);
        }

        this.gameSession.save();
    }

    private onLoadStateClick(): void {
        const stateString = window.localStorage.getItem(NES_SAVE_STATE_STORAGE_KEY);
        if (!stateString) {
            throw new Error(`There is no save state in the local storage`);
        }

        const state = JSON.parse(stateString);

        if (this.gameSession) {
            this.gameSession.destroy();
        }

        console.log('load', state);
        this.gameSession = GameSession.fromSerializedState(state, this.createScreenInterface(), this.gamepadSettingsView.getGamepadInterface());
        this.gameSession.nes.run();
        this.render();
    }

    private createGameSession(buffer: ArrayBuffer): void {
        const cartridge = new Cartridge(parseCartridge(buffer));
        this.gameSession = GameSession.fromCartridge(cartridge, this.createScreenInterface(), this.gamepadSettingsView.getGamepadInterface());
        this.render();
    }

    private render(): void {
        if (!this.gameSession) {
            return;
        }

        //this.cpuStatusView.render(this.gameSession.nes.cpu);
        //this.cpuProgramView.render(this.gameSession.nes.cpu, this.gameSession.nes.bus);
        //this.memoryView.render(this.gameSession.nes.bus);
        //this.paletteView.render(this.gameSession.nes.ppu);
        //this.patternView.render(this.gameSession.nes.ppu);
        //this.nametableView.render(this.gameSession.nes.ppu);
        //this.oamView.render(this.gameSession.nes.ppu);
    }
}

function main(): void {
    const container = document.getElementById('emulator-debugger');
    if (!container) {
        throw new Error(`Can't find container with id "emulator-debugger"`);
    }

    new EmulatorDebuggerUI(container);
}

document.addEventListener('DOMContentLoaded', main);
