import {parseCartridge} from '../src/cartridge-parser';
import {Constants} from '../src/constants';
import {MirroringMode} from '../src/mirroring-mode';

import {nestestJson} from '../data/nestest.nes';
const nestestRom = new Uint8Array(nestestJson).buffer;

describe('Cartridge parser', () => {
    it('parse nestest.nes right', () => {
        const {header, prgRom, chrData} = parseCartridge(nestestRom);
        expect(header).toEqual({prgSize16K: 1, chrSize8K: 1, mapper: 0, haveTrainer: false, mirroring: MirroringMode.HORIZONTAL});
        expect(prgRom.length).toEqual(16 * Constants.KILOBYTE);
        expect(chrData.length).toEqual(8 * Constants.KILOBYTE);
    });

    it('throw error if rom is not in iNes format', () => {
        const wrongRom = new Uint8Array(Constants.KILOBYTE);
        expect(() => parseCartridge(wrongRom)).toThrow();
    });
});
