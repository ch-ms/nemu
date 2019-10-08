import {Nes} from './nes';
import {Uint16, Uint8} from './types';

function* iteratePage(addrInPage: Uint16): IterableIterator<number> {
    const pageAddr = addrInPage & 0xff00;
    for (let addr = pageAddr; addr <= pageAddr + 0xff; addr++) {
        yield addr;
    }
}

function toHex(byte: Uint8): string {
    const hex = byte.toString(16);
    return hex.length == 1 ? `0${hex}` : hex;
}

class NesDebugger {
    private readonly nes = new Nes();
    private readonly container: Element;
    private readonly btnStep: Element;
    private readonly btnReset: Element;
    private readonly page00: Element;
    private readonly page80: Element;

    constructor(container: Element) {
        this.container = container;
        this.btnStep = container.querySelector('#step')!;
        this.btnReset = container.querySelector('#reset')!;
        this.page00 = container.querySelector('#page00')!;
        this.page80 = container.querySelector('#page80')!;

        this.btnStep.addEventListener('click', this.onBtnStepClick);
        this.btnReset.addEventListener('click', this.onBtnResetClick);

        this.render();
    }

    private render(): void {
        this.renderPage00();
        this.renderPage80();
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

            result.push(toHex(this.nes.bus.read(addr)));
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

    }

    private renderProgram(): void {

    }

    private onBtnStepClick = (): void => {

    }

    private onBtnResetClick = (): void => {

    }
}

function main(): void {
    new NesDebugger(document.getElementById('debugger')!);
}

document.addEventListener('DOMContentLoaded', main);
