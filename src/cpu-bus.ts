import {Uint16, Uint8, Numbers} from './numbers';
import {Bus} from './interfaces';
import {Ppu} from './ppu';
import {Apu, ApuConstants} from './apu';
import {Constants} from './constants';
import {Cartridge} from './cartridge';
import {GamepadInterface, defaultGamepadInterface} from './gamepad';
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

    private gamepad1Shifter: Uint8 = 0;
    private gamepad2Shifter: Uint8 = 0;

    private oamDmaPage: Uint8 = 0;
    private oamDmaOffset: Uint8 = 0;
    private oamDmaTransfer = false;

    constructor(
        private readonly cartridge: Cartridge,
        private readonly ppu: Ppu,
        private readonly apu: Apu,
        private readonly gamepad1Interface: GamepadInterface = defaultGamepadInterface,
        private readonly gamepad2Interface: GamepadInterface = defaultGamepadInterface,
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

    // TODO mb some mechanism to perform addr mapping?
    read(addr: Uint16): Uint8 {
        if (addr >= 0x0 && addr < 0x2000) {
            return this.ram[addr % 0x800];

        } else if (addr >= 0x2000 && addr < 0x4000) {
            return this.ppu.read(addr % 0x8);

        } else if (addr >= ApuConstants.PULSE_1_CONTROL && addr < CpuBusConstants.OAM_DMA_ADDR) {
            // Apu is not readable
            return 0;

        } else if (addr === CpuBusConstants.OAM_DMA_ADDR) {
            // OAM DMA is not readable
            return 0;

        } else if (addr === ApuConstants.STATUS) {
            // Apu is not readable
            return 0;

        } else if (addr === CpuBusConstants.CONTROLLER_1_ADDR) {
            const data = (this.gamepad1Shifter & Constants.BIT_8) && 1;
            this.gamepad1Shifter = (this.gamepad1Shifter << 1) & Numbers.UINT8_CAST;
            return data;

        } else if (addr === CpuBusConstants.CONTROLLER_2_ADDR) {
            const data = (this.gamepad2Shifter & Constants.BIT_8) && 1;
            this.gamepad2Shifter = (this.gamepad2Shifter << 1) & Numbers.UINT8_CAST;
            return data;

        } else if (addr >= 0x4018 && addr < 0x4020) {
            // Apu and IO functionality that is normally disabled
            // https://wiki.nesdev.com/w/index.php/CPU_Test_Mode
            return 0;

        } else if (addr >= 0x4020 && addr < 0x10000) {
            return this.cartridge.read(addr);
        }

        throw Error(`Can't map addr "${addr}" to device`);
    }

    write(addr: Uint16, data: Uint8): void {
        if (addr >= 0x0 && addr < 0x2000) {
            this.ram[addr % 0x800] = data;

        } else if (addr >= 0x2000 && addr < 0x4000) {
            this.ppu.write(addr % 0x8, data);

        } else if (addr >= ApuConstants.PULSE_1_CONTROL && addr < CpuBusConstants.OAM_DMA_ADDR) {
            this.apu.write(addr, data);

        } else if (addr === CpuBusConstants.OAM_DMA_ADDR) {
            this.oamDmaPage = data;
            this.oamDmaOffset = 0;
            this.oamDmaTransfer = true;

        } else if (addr === ApuConstants.STATUS) {
            this.apu.write(addr, data);

        } else if (addr === CpuBusConstants.CONTROLLER_1_ADDR) {
            // See https://wiki.nesdev.com/w/index.php/Controller_reading for proper implementation
            // See https://wiki.nesdev.com/w/index.php/2A03
            this.gamepad1Shifter = this.gamepad1Interface();
            this.gamepad2Shifter = this.gamepad2Interface();

        } else if (addr === ApuConstants.FRAME_COUNTER) {
            this.apu.write(addr, data);

        } else if (addr >= 0x4018 && addr < 0x4020) {
            // Apu and IO functionality that is normally disabled
            // https://wiki.nesdev.com/w/index.php/CPU_Test_Mode

        } else if (addr >= 0x4020 && addr < 0x10000) {
            this.cartridge.write(addr, data);

        } else {
            throw Error(`Can't map addr "${addr}" to device`);
        }
    }

    serialize(): CpuBusState {
        return {ram: Array.from(this.ram)};
    }
}

export {CpuBus};
