import {Uint16, Uint8, Numbers} from './numbers';
import {Bus} from './interfaces';
import {Ppu} from './ppu';
import {Constants} from './constants';
import {Cartridge} from './cartridge';
import {ControllerInterface, defaultControllerInterface} from './controller';
import {fillUint8Array} from './utils/utils';

const enum CpuBusConstants {
    CONTROLLER_1_ADDR = 0x4016,
    CONTROLLER_2_ADDR = 0x4017,
    OAM_DMA_ADDR = 0x4014
}

export interface CpuBusState {
    ram: Uint8[];
}

/**
 * Nes bus
 */
class CpuBus implements Bus {
    private readonly ram = new Uint8Array(2 * Constants.KILOBYTE);

    private controller1Shifter: Uint8 = 0;
    private controller2Shifter: Uint8 = 0;

    private oamDmaPage: Uint8 = 0;
    private oamDmaOffset: Uint8 = 0;
    private oamDmaTransfer = false;

    constructor(
        private readonly cartridge: Cartridge,
        private readonly ppu: Ppu,
        private readonly controller1Interface: ControllerInterface = defaultControllerInterface,
        private readonly controller2Interface: ControllerInterface = defaultControllerInterface,
        state?: CpuBusState
    ) {
        if (state) {
            fillUint8Array(this.ram, state.ram);
        }
    }

    get isOamDmaTransfer(): boolean {
        return this.oamDmaTransfer;
    }

    getOamDmaOffset(): Uint8 {
        return this.oamDmaOffset;
    }

    getOamDmaByte(): Uint8 {
        if (!this.oamDmaTransfer) {
            throw new Error('Not in OAM DMA transfer');
        }

        // Addr cant overflow because we start at beginning of the page and end at the end
        return this.read((this.oamDmaPage << 8) | this.oamDmaOffset);
    }

    /**
     * @returns {Boolean} true - oam dma transfer completed, false otherwise
     */
    progressOamDmaTransfer(): boolean {
        if (!this.oamDmaTransfer) {
            throw new Error('Not in OAM DMA transfer');
        }

        this.oamDmaOffset = (this.oamDmaOffset + 1) & Numbers.UINT8_CAST;
        this.oamDmaTransfer = this.oamDmaOffset !== 0;
        return this.oamDmaTransfer;
    }

    write(addr: Uint16, data: Uint8): void {
        if (addr >= 0x0 && addr < 0x2000) {
            this.ram[addr % 0x800] = data;
        } else if (addr >= 0x2000 && addr < 0x4000) {
            this.ppu.write(addr % 0x8, data);
        } else if (addr === CpuBusConstants.CONTROLLER_1_ADDR) {
            this.controller1Shifter = this.controller1Interface();
        } else if (addr === CpuBusConstants.CONTROLLER_2_ADDR) {
            this.controller2Shifter = this.controller2Interface();
        } else if (addr === CpuBusConstants.OAM_DMA_ADDR) {
            this.oamDmaPage = data;
            this.oamDmaOffset = 0;
            this.oamDmaTransfer = true;
        } else if (addr >= 0x4000 && addr < 0x4020) {
            // TODO map to APU
        } else if (addr >= 0x4020 && addr < 0x10000) {
            this.cartridge.write(addr, data);
        } else {
            throw Error(`Can't map addr "${addr}" to device`);
        }
    }

    // TODO mb some mechanism to perform addr mapping?
    read(addr: Uint16): Uint8 {
        if (addr >= 0x0 && addr < 0x2000) {
            return this.ram[addr % 0x800];
        } else if (addr >= 0x2000 && addr < 0x4000) {
            return this.ppu.read(addr % 0x8);
        } else if (addr === CpuBusConstants.CONTROLLER_1_ADDR) {
            const data = (this.controller1Shifter & Constants.BIT_7) && 1;
            this.controller1Shifter = (this.controller1Shifter << 1) & Numbers.UINT8_CAST;
            return data;
        } else if (addr === CpuBusConstants.CONTROLLER_2_ADDR) {
            const data = (this.controller2Shifter & Constants.BIT_7) && 1;
            this.controller2Shifter = (this.controller2Shifter << 1) & Numbers.UINT8_CAST;
            return data;
        } else if (addr === CpuBusConstants.OAM_DMA_ADDR) {
            // OAM DMA is not readable
            return 0;
        } else if (addr >= 0x4000 && addr < 0x4020) {
            // TODO map to APU
            return 0;
        } else if (addr >= 0x4020 && addr < 0x10000) {
            return this.cartridge.read(addr);
        }

        throw Error(`Can't map addr "${addr}" to device`);
    }

    serialize(): CpuBusState {
        return {ram: Array.from(this.ram)};
    }
}

export {CpuBus};
