import {Bus} from '../interfaces';
import {Uint16} from '../types';
import {uint8ToHex, iteratePage} from '../utils/utils';

class MemoryView {
    private readonly pageSelector: HTMLSelectElement;
    private readonly memoryContent: HTMLElement;
    pageChanged: () => void = () => {};

    constructor(
        private readonly container: HTMLElement,
        private currentPage: Uint16 = 0x0000
    ) {
        this.pageSelector = this.container.querySelector('select[name=page-selector]') as HTMLSelectElement;
        this.memoryContent = this.container.querySelector('.memory-explorer__content') as HTMLElement;
        this.renderPages();

        this.pageSelector.addEventListener('change', this.onPageSelectorChange);
    }

    render(bus: Bus): void {
        const result: string[] = [];
        let byteNum = 0;
        let isFirstByte = true;
        for (const addr of iteratePage(this.currentPage)) {
            if (byteNum === 16) {
                result.push('\n');
                byteNum = 0;
            } else if (!isFirstByte) {
                result.push(' ');
            }

            result.push(uint8ToHex(bus.read(addr)));
            byteNum++;
            isFirstByte = false;
        }

        this.memoryContent.innerText = result.join('');
    }

    private renderPages(): void {
        const fragment = document.createDocumentFragment();
        for (let i = 0x00; i <= 0xFF; i += 0x01) {
            const option = document.createElement('option');
            option.innerText = uint8ToHex(i);
            fragment.appendChild(option);
        }
        this.pageSelector.appendChild(fragment);
    }

    private onPageSelectorChange = (): void => {
        const page = parseInt(this.pageSelector.value, 16);
        if (isNaN(page)) {
            throw new Error(`Page is NaN "${this.pageSelector.value}"`);
        }

        this.currentPage = page << 8;
        this.pageChanged();
    }
}

export {MemoryView};
