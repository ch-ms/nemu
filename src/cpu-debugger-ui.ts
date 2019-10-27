import {Uint16, Uint8} from './types';
import {LOOKUP} from './lookup';
import {CpuDebugger} from './cpu-debugger';

function* iterateRam(startAddr: Uint16, endAddr: Uint16): IterableIterator<number> {
    for (let addr = startAddr; addr <= endAddr; addr++) {
        yield addr;
    }
}

function* iteratePage(addrInPage: Uint16): IterableIterator<number> {
    const pageAddr = addrInPage & 0xff00;
    for (const addr of iterateRam(pageAddr, pageAddr + 0xff)) {
        yield addr;
    }
}

function stuffWithZeros(str: string, size: number): string {
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

const enum CpuDebuggerUIConstants {
    EXAMPLE_PRG = 'A2 0A 8E 00 00 A9 05 ED 00 00 EA EA EA'
}
class CpuDebuggerUI {
    private readonly container: Element;
    private readonly btnStep: Element;
    private readonly btnReset: Element;
    private readonly btnLoad: Element;
    private readonly page00: Element;
    private readonly page80: Element;
    private readonly status: Element;
    private readonly program: Element;
    private readonly programData: HTMLTextAreaElement;

    private readonly cpuDebugger: CpuDebugger;

    constructor(container: Element, cpuDebugger: CpuDebugger) {
        this.container = container;
        this.btnStep = container.querySelector('#step')!;
        this.btnReset = container.querySelector('#reset')!;
        this.btnLoad = container.querySelector('#load')!;
        this.page00 = container.querySelector('#page00')!;
        this.page80 = container.querySelector('#page80')!;
        this.status = this.container.querySelector('#status')!;
        this.program = this.container.querySelector('#program')!;
        this.programData = this.container.querySelector('#program-data')! as HTMLTextAreaElement;

        this.btnStep.addEventListener('click', this.onBtnStepClick);
        this.btnReset.addEventListener('click', this.onBtnResetClick);
        this.btnLoad.addEventListener('click', this.onBtnLoadClick);

        this.cpuDebugger = cpuDebugger;
        this.loadProgram(CpuDebuggerUIConstants.EXAMPLE_PRG);
    }

    private loadProgram(program: string): void {
        this.programData.value = program;
        this.cpuDebugger.loadProgram(program);
        this.render();
    }

    private onBtnStepClick = (): void => {
        this.cpuDebugger.executeInstruction();
        this.render();
    }

    private onBtnResetClick = (): void => {
        this.cpuDebugger.reset();
        this.render();
    }

    private onBtnLoadClick = (): void => {
        this.loadProgram(this.programData.value);
    }

    private render(): void {
        this.renderPage00();
        this.renderPage80();
        this.renderStatus();
        this.renderProgram();
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

            result.push(uint8ToHex(this.cpuDebugger.nes.bus.read(addr)));
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
            `       NVUBDIZC`,
            `Flags: ${stuffWithZeros(this.cpuDebugger.nes.cpu.status.toString(2), 8)} `,
            `PC: $${uint16ToHex(this.cpuDebugger.nes.cpu.programCounter)}`,
            `SP: $${uint8ToHex(this.cpuDebugger.nes.cpu.stackPointer)}`,
            `A: $${uint8ToHex(this.cpuDebugger.nes.cpu.a)}`,
            `X: $${uint8ToHex(this.cpuDebugger.nes.cpu.x)}`,
            `Y: $${uint8ToHex(this.cpuDebugger.nes.cpu.y)}`
        ];

        this.status.innerHTML = result.join('\n');
    }

    // TODO: make real disassembler
    private renderProgram(): void {
        const result = [];
        const startAddr = this.cpuDebugger.nes.cpu.programCounter;
        for (const addr of iterateRam(startAddr, this.cpuDebugger.nes.cpu.programCounter + 15)) {
            const byte = this.cpuDebugger.nes.bus.read(addr);
            if (addr === startAddr) {
                const [instructionMnemonic, addrModeMnemonic] = LOOKUP[byte];
                result.push(`${instructionMnemonic} (${addrModeMnemonic})`);
            } else {
                result.push(uint8ToHex(byte));
            }
        }

        this.program.innerHTML = result.join(' ');
    }
}

function main(): void {
    new CpuDebuggerUI(document.getElementById('debugger')!, new CpuDebugger());
}

document.addEventListener('DOMContentLoaded', main);
