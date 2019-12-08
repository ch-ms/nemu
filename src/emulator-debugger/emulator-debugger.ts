import {Nes} from '../nes';
import {Cpu} from '../cpu';
import {ScreenInterface, Color} from '../ppu';
import {parseCartridge} from '../cartridge-parser';
import {Cartridge} from '../cartridge';
import {cpuStatusToFormattedString} from '../utils/utils';
import {CpuProgramView} from './cpu-program-view';
import {MemoryView} from './memory-view';

import * as nestestJson from '../../data/nestest.nes.json';
const nestestRom = new Uint8Array(nestestJson).buffer;

class GameSession {
    readonly nes: Nes;
    constructor(cartridge: Cartridge, screenInterface: ScreenInterface) {
        this.nes = new Nes(cartridge, screenInterface);
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
    private readonly screenInterface: ScreenInterface;
    private gameSession?: GameSession;

    constructor(private readonly container: HTMLElement) {
        this.cartridgeFileInput = container.querySelector('#cartridge-input') as HTMLInputElement;
        this.cartridgeFileInput.addEventListener('change', () => this.onCartridgeInputChange());

        this.cpuStatusView = new CpuStatusView(this.container.querySelector('.status-explorer') as HTMLElement);
        this.cpuProgramView = new CpuProgramView(this.container.querySelector('.program-explorer') as HTMLElement);

        this.memoryView = new MemoryView(this.container.querySelector('.memory-explorer') as HTMLElement);
        this.memoryView.pageChanged = (): void => this.render();

        this.screenInterface = this.createScreenInterface();

        this.container.querySelector('button[name=step-instruction]')!.addEventListener('click', this.onStepInstructionClick);
        this.container.querySelector('button[name=reset]')!.addEventListener('click', this.onResetClick);
        this.container.querySelector('button[name=run]')!.addEventListener('click', this.onRunClick);
        this.container.querySelector('button[name=pause]')!.addEventListener('click', this.onPauseClick);

        this.createGameSession(nestestRom);
    }

    private createScreenInterface(): ScreenInterface {
        const canvas = this.container.querySelector('#canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('Error while receiving context from canvas');
        }

        const imageData = ctx.createImageData(canvas.width, canvas.height);
        return {
            setPixel: (x: number, y: number, color: Color): void => {
                const index = (y * canvas.width + x) * 4;
                imageData.data[index] = color[0];
                imageData.data[index + 1] = color[1];
                imageData.data[index + 2] = color[2];
                imageData.data[index + 3] = 255;
            },

            frameCompleted: (): void => {
                ctx.putImageData(imageData, 0, 0);
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

    private createGameSession(buffer: ArrayBuffer): void {
        const cartridge = new Cartridge(parseCartridge(buffer));
        this.gameSession = new GameSession(cartridge, this.screenInterface);
        this.render();
    }

    private render(): void {
        if (!this.gameSession) {
            return;
        }

        this.cpuStatusView.render(this.gameSession.nes.cpu);
        this.cpuProgramView.render(this.gameSession.nes.cpu, this.gameSession.nes.bus);
        this.memoryView.render(this.gameSession.nes.bus);
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
