import {parseCartridge} from '../src/cartridge-parser';
import {Constants} from '../src/constants';

import * as nestestJson from '../data/nestest.nes.json';
const nestestRom = new Uint8Array(nestestJson).buffer;

describe('Cartridge parser', () => {
    it('parse nestest.nes right', () => {
        const {header, prgRom, chrRom} = parseCartridge(nestestRom);
        expect(header).toEqual({prgSize16K: 1, chrSize8K: 1, mapper: 0, haveTrainer: false});
        expect(prgRom.length).toEqual(16 * Constants.KILOBYTE);
        expect(chrRom.length).toEqual(8 * Constants.KILOBYTE);
    });

    it('throw error if rom is not in iNes format', () => {
        const wrongRom = new Uint8Array(Constants.KILOBYTE);
        expect(() => parseCartridge(wrongRom)).toThrow();
    });
});
