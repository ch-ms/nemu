import {Ppu, PpuConstants} from '../ppu';
import {uint8ToHex} from '../utils/utils';

class OamView {
    constructor(private readonly container: HTMLElement) {
    }

    render(ppu: Ppu): void {
        const oamObjectsCount = PpuConstants.OAM_SIZE / 4;
        const content = [];
        for (let i = 0; i < oamObjectsCount; i++) {
            const index = i * 4;
            const y = ppu.readOam(index);
            const id = ppu.readOam(index + 1);
            const attr = ppu.readOam(index + 2);
            const x = ppu.readOam(index + 3);
            content.push(`(${x}, ${y}) id:${uint8ToHex(id)} a:${uint8ToHex(attr)}`);
        }

        this.container.innerHTML = content.join('\n');
    }
}

export {OamView};
