import {Uint16} from './types';
import {CpuDebugger} from './cpu-debugger';
import {
    cpuStatusToFormattedString,
    uint8ToHex,
    iteratePage
} from './utils/utils';
import {CpuProgramView} from './emulator-debugger/cpu-program-view';

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
    private readonly programData: HTMLTextAreaElement;

    private readonly cpuProgramView: CpuProgramView;

    private readonly cpuDebugger: CpuDebugger;

    constructor(container: Element, cpuDebugger: CpuDebugger) {
        this.container = container;
        this.btnStep = container.querySelector('#step')!;
        this.btnReset = container.querySelector('#reset')!;
        this.btnLoad = container.querySelector('#load')!;
        this.page00 = container.querySelector('#page00')!;
        this.page80 = container.querySelector('#page80')!;
        this.status = this.container.querySelector('#status')!;
        this.programData = this.container.querySelector('#program-data')! as HTMLTextAreaElement;

        this.cpuProgramView = new CpuProgramView(this.container.querySelector('#program') as HTMLElement);

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
        this.cpuProgramView.render(this.cpuDebugger.cpu, this.cpuDebugger.bus);
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

            result.push(uint8ToHex(this.cpuDebugger.bus.read(addr)));
            byteNum++;
        }

        element.innerHTML = result.join('');
    }

    // TODO Use memory view
    private renderPage00(): void {
        this.renderPage(0x0000, this.page00);
    }

    private renderPage80(): void {
        this.renderPage(0x8000, this.page80);
    }

    private renderStatus(): void {
        this.status.innerHTML = cpuStatusToFormattedString(this.cpuDebugger.cpu);
    }
}

function main(): void {
    new CpuDebuggerUI(document.getElementById('debugger')!, new CpuDebugger());
}

document.addEventListener('DOMContentLoaded', main);
