import {MirroringMode} from './mirroring-mode';

interface CartridgeHeader {
    prgSize16K: number;
    chrSize8K: number;
    mapper: number;
    haveTrainer: boolean;
    mirroring: number;
}

interface BaseCartridgeData<T> {
    header: CartridgeHeader;
    prgRom: T;
    chrRom: T;
}

type CartridgeData = BaseCartridgeData<Uint8Array>;
export type SerializedCartridgeData = BaseCartridgeData<number[]>;

const enum CartridgeConstants {
    HEADER_OFFSET = 16,
    TRAINER_OFFSET = 512,
    PRG_BANK_SIZE = 16384,
    CHR_BANK_SIZE = 8192,
    // "NES" followed by MS-DOS end-of-file
    NES_FILE_FORMAT = 'NES\u001a'
}

function getPrgRomOffset(header: CartridgeHeader): number {
    return header.haveTrainer ?
        CartridgeConstants.TRAINER_OFFSET + CartridgeConstants.HEADER_OFFSET :
        CartridgeConstants.HEADER_OFFSET;
}

function getChrRomOffset(header: CartridgeHeader): number {
    return getPrgRomOffset(header) + header.prgSize16K * CartridgeConstants.PRG_BANK_SIZE;
}

function parseHeader(data: Uint8Array): CartridgeHeader {
    const fileFormat = [data[0], data[1], data[2], data[3]].map((n) => String.fromCharCode(n)).join('');
    if (fileFormat !== CartridgeConstants.NES_FILE_FORMAT) {
        throw new Error('Cartridge does not match iNES file format');
    }

    const prgSize16K = data[4];
    const chrSize8K = data[5];

    const flags6 = data[6];
    const flags7 = data[7];

    const haveTrainer = Boolean(flags6 & 0b100);

    const loMapper = flags6 & 0b11110000;
    const hiMapper = flags7 & 0b11110000;
    const mapper = hiMapper | (loMapper >> 4);

    const mirroring = (flags6 & 0x1) === 0 ?
        MirroringMode.HORIZONTAL : MirroringMode.VERTICAL;

    return {
        prgSize16K,
        chrSize8K,
        mapper,
        haveTrainer,
        mirroring
    };
}

function parsePrgRom(data: Uint8Array, header: CartridgeHeader): Uint8Array {
    const offset = getPrgRomOffset(header);
    return data.slice(offset, offset + CartridgeConstants.PRG_BANK_SIZE * header.prgSize16K);
}

function parseChrRom(data: Uint8Array, header: CartridgeHeader): Uint8Array {
    const offset = getChrRomOffset(header);
    return data.slice(offset, offset + CartridgeConstants.CHR_BANK_SIZE * header.chrSize8K);
}

// https://wiki.nesdev.com/w/index.php/INES
function parseCartridge(buffer: ArrayBuffer): CartridgeData {
    const data = new Uint8Array(buffer);
    const header = parseHeader(data);
    const prgRom = parsePrgRom(data, header);
    const chrRom = parseChrRom(data, header);

    return {header, prgRom, chrRom};
}

function serializeCartridgeData(data: CartridgeData): SerializedCartridgeData {
    return {
        header: {...data.header},
        prgRom: Array.from(data.prgRom.values()),
        chrRom: Array.from(data.chrRom.values())
    };
}

function deserializeCartridgeData(serialized: SerializedCartridgeData): CartridgeData {
    return {
        header: {...serialized.header},
        prgRom: Uint8Array.from(serialized.prgRom),
        chrRom: Uint8Array.from(serialized.chrRom)
    }
}

export {
    CartridgeData,
    CartridgeHeader,
    parseCartridge,
    serializeCartridgeData,
    deserializeCartridgeData
};
