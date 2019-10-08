import {Nes} from './nes';
import {CpuConstants} from './cpu';
import {Uint16, Uint8} from './types';

function* iteratePage(addrInPage: Uint16): IterableIterator<number> {
    const pageAddr = addrInPage & 0xff00;
    for (let addr = pageAddr; addr <= pageAddr + 0xff; addr++) {
        yield addr;
    }
}

function stuffWithZeros(str: string, size: number) {
    if (str.length >= size) {
        return str;
    }

    while (str.length !== size) {
        str = `0${str}`;
    }

    return str;
}

function uint8ToHex(uint8: Uint8): string {
    const hex = uint8.toString(16);
    return stuffWithZeros(hex, 2);
}

function uint16ToHex(uint16: Uint16): string {
    const hex = uint16.toString(16);
    return stuffWithZeros(hex, 4);
}

class NesDebugger {
    private readonly nes = new Nes();
    private readonly container: Element;
    private readonly btnStep: Element;
    private readonly btnReset: Element;
    private readonly page00: Element;
    private readonly page80: Element;
    private readonly status: Element;

    constructor(container: Element) {
        this.container = container;
        this.btnStep = container.querySelector('#step')!;
        this.btnReset = container.querySelector('#reset')!;
        this.page00 = container.querySelector('#page00')!;
        this.page80 = container.querySelector('#page80')!;
        this.status = this.container.querySelector('#status')!;

        this.btnStep.addEventListener('click', this.onBtnStepClick);
        this.btnReset.addEventListener('click', this.onBtnResetClick);

        this.reset();
        this.render();
    }

    private render(): void {
        this.renderPage00();
        this.renderPage80();
        this.renderStatus();
    }

    private renderPage(addrInPage: Uint16, element: Element): void {
        const result: string[] = [];
        let byteNum = 0;
        for (const addr of iteratePage(addrInPage)) {
            if (byteNum === 16) {
                result.push('\n');
                byteNum = 0;
            } else if (addrInPage !== addr) {
                result.push(' ');
            }

            result.push(uint8ToHex(this.nes.bus.read(addr)));
            byteNum++;
        }

        element.innerHTML = result.join('');
    }

    private renderPage00(): void {
        this.renderPage(0x0000, this.page00);
    }

    private renderPage80(): void {
        this.renderPage(0x8000, this.page80);
    }

    private renderStatus(): void {
        const result = [
            `Status (NVUBDIZC): ${stuffWithZeros(this.nes.cpu.status.toString(2), 8)} `,
            `PC: $${uint16ToHex(this.nes.cpu.programCounter)}`,
            `A: $${uint8ToHex(this.nes.cpu.a)}`,
            `X: $${uint8ToHex(this.nes.cpu.x)}`,
            `Y: $${uint8ToHex(this.nes.cpu.y)}`,
            `Stack Pointer: $${uint16ToHex(this.nes.cpu.stackPointer)}`
        ];

        this.status.innerHTML = result.join('\n');
    }

    private renderProgram(): void {
        // just scan memory around current pc
    }

    private onBtnStepClick = (): void => {

    }

    private onBtnResetClick = (): void => {

    }

    private reset(): void {
        this.nes.bus.write(CpuConstants.BASE_INSTRUCTION_ADDR, 0x00);
        this.nes.bus.write(CpuConstants.BASE_INSTRUCTION_ADDR + 1, 0x80);
        this.nes.cpu.reset();
    }
}

function main(): void {
    new NesDebugger(document.getElementById('debugger')!);
}

document.addEventListener('DOMContentLoaded', main);
