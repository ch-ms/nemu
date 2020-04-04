import {CpuDebugger, CpuDebuggerConstants} from '../src/cpu-debugger';
import {StatusFlags, CpuConstants} from '../src/cpu';

interface CpuStatus {
    a?: number;
    x?: number;
    y?: number;
    status?: number;
    remainingCycles?: number;
    programCounter?: number;
    stackPointer?: number;
}

describe('Cpu', () => {
    let cpuDebugger = new CpuDebugger();
    let {cpu, bus} = cpuDebugger;
    let initialProgramAddress = cpu.programCounter;
    const STACK_ADDR = CpuConstants.BASE_STACK_ADDR + CpuConstants.BASE_STACK_OFFSET;

    function checkCpuStatus(program: string, skipOperations: number, cpuStatus: CpuStatus): void {
        cpuDebugger.loadProgram(program);
        cpuDebugger.executeNInstructions(skipOperations);

        cpu.clock();

        if (typeof cpuStatus.programCounter === 'number') {
            expect(cpu.programCounter).toEqual(cpuStatus.programCounter);
        }

        if (typeof cpuStatus.remainingCycles === 'number') {
            expect(cpu.remainingCycles).toEqual(cpuStatus.remainingCycles);
        }

        if (typeof cpuStatus.a === 'number') {
            expect(cpu.a).toEqual(cpuStatus.a);
        }

        if (typeof cpuStatus.x === 'number') {
            expect(cpu.x).toEqual(cpuStatus.x);
        }

        if (typeof cpuStatus.y === 'number') {
            expect(cpu.y).toEqual(cpuStatus.y);
        }

        if (typeof cpuStatus.status === 'number') {
            expect(cpu.status).toEqual(cpuStatus.status);
        }

        if (typeof cpuStatus.stackPointer === 'number') {
            expect(cpu.stackPointer).toEqual(cpuStatus.stackPointer);
        }
    }

    beforeEach(() => {
        cpuDebugger = new CpuDebugger();
        cpuDebugger.reset();
        cpu = cpuDebugger.cpu;
        bus = cpuDebugger.bus;
        initialProgramAddress = cpu.programCounter;
    });

    describe('reset', () => {
        it('resets cpu state', () => {
            bus.write(0xfffc, 0x34);
            bus.write(0xfffc + 1, 0x12);
            cpu.reset();
            expect(cpu.a).toEqual(0);
            expect(cpu.x).toEqual(0);
            expect(cpu.y).toEqual(0);
            expect(cpu.status).toEqual(0b00100000);
            expect(cpu.stackPointer).toEqual(0xfd);
            expect(cpu.programCounter).toEqual(0x1234);
            expect(cpu.remainingCycles).toEqual(8);
        });
    });

    describe('nmi', () => {
        it('process non maskable interrupt', () => {
            cpu.write(CpuConstants.BASE_NMI_ADDR, 0xcc);
            cpu.write(CpuConstants.BASE_NMI_ADDR + 1, 0xcc);
            // LDA #255
            cpuDebugger.loadProgram('A9 FF');
            cpuDebugger.executeNInstructions(1);
            const pc = cpu.programCounter;
            const status = cpu.status;
            cpu.nmi();
            expect(cpu.read(cpu.stackAddr + 3)).toEqual((pc >>> 8) & 0xff);
            expect(cpu.read(cpu.stackAddr + 2)).toEqual(pc & 0xff);
            expect(cpu.read(cpu.stackAddr + 1)).toEqual(status | 0b00100100);
            expect(cpu.programCounter).toEqual(0xcccc);
            expect(cpu.remainingCycles).toEqual(8);
        });
    });

    describe('Addr mode ABX, ABY', () => {
        it('Add two numbers with ABX', () => {
            const cycles = 4;
            // LDA #2
            // STA 0001
            // LDX #1
            // ADC 0000,X
            checkCpuStatus(
                'A9 02 8D 01 00 A2 01 7D 00 00',
                3,
                {
                    remainingCycles: cycles - 1,
                    a: 4,
                    status: 0b00100000
                }
            );
        });

        it('Add two numbers with ABY with address overflow and page crossing', () => {
            const cycles = 5;
            // LDA #2
            // STA 0000
            // LDY #1
            // ADC $FFFF,Y
            checkCpuStatus(
                'A9 02 8D 00 00 A0 01 79 FF FF',
                3,
                {
                    remainingCycles: cycles - 1,
                    a: 4,
                    status: 0b00100000
                }
            );
        });
    });

    describe('Addr mode ZP0, ZPX, ZPY', () => {
        it('Stores A by ZP0', () => {
            const cycles = 3;
            // LDA #3
            // STA *07
            checkCpuStatus(
                'A9 03 85 07',
                1,
                {
                    remainingCycles: cycles - 1
                }
            );
            expect(cpu.read(0x7)).toEqual(3);
        });

        it('Stores Y by ZPX', () => {
            const cycles = 4;
            // LDX #1
            // LDY #3
            // STY *07,X
            checkCpuStatus(
                'A2 01 A0 03 94 07',
                2,
                {
                    remainingCycles: cycles - 1
                }
            );
            expect(cpu.read(0x8)).toEqual(3);
        });

        it('Stores X by ZPY with address overflow', () => {
            const cycles = 4;
            // LDX #5
            // LDY #254
            // STX *07,Y
            checkCpuStatus(
                'A2 05 A0 FE 96 07',
                2,
                {
                    remainingCycles: cycles - 1
                }
            );
            expect(cpu.read(0x5)).toEqual(5);
        });
    });

    describe('addrModeIZY', () => {
        it('Add two numbers with IZY', () => {
            const cycles = 5;
            // LDA #7
            // STA $ff
            // LDA #$fe
            // STA 40
            // LDA #7
            // LDY #1
            // ADC (40),Y
            checkCpuStatus(
                'A9 07 8D FF 00 A9 FE 8D 28 00 A9 07 A0 01 71 28',
                6,
                {
                    remainingCycles: cycles - 1,
                    a: 14
                }
            );
        });

        it('Subtract two numbers with IZY with page crossing', () => {
            const cycles = 6;
            // LDA #5
            // STA $101
            // LDA #$fe
            // STA 40
            // LDA #7
            // LDY #3
            // SBC (40),Y
            checkCpuStatus(
                'A9 05 8D 01 01 A9 FE 8D 28 00 A9 07 A0 03 F1 28',
                6,
                {
                    remainingCycles: cycles - 1,
                    // 1 because of carry borrow
                    a: 1
                }
            );

        });
    });

    describe('addrModeIZX', () => {
        it('Logical OR with IZX', () => {
            const cycles = 6;
            // LDA #$AA
            // STA $00A1
            // LDA #$BB
            // STA $00A0
            // LDX #1
            // LDA #%10001000
            // STA $AABB
            // LDA #%00100010
            // ORA ($9f,X)
            checkCpuStatus(
                'A9 AA 8D A1 00 A9 BB 8D A0 00 A2 01 A9 88 8D BB AA A9 22 01 9F',
                8,
                {
                    remainingCycles: cycles - 1,
                    a: 0b10101010
                }
            );
        });
    });

    describe('addrModeIND', () => {
        it('Jump with IND', () => {
            const cycles = 5;
            // LDX #$AA
            // STX $A1
            // LDX #$BB
            // STX $A0
            // JMP ($00A0)
            checkCpuStatus(
                'A2 AA 8E A1 00 A2 BB 8E A0 00 6C A0 00',
                4,
                {
                    remainingCycles: cycles - 1,
                    programCounter: 0xaabb
                }
            );
        });

        it('Jump with IND page overflow', () => {
            const cycles = 5;
            // LDX #$AA
            // STX $100
            // LDX #$BB
            // STX $FF
            // JMP ($00FF)
            checkCpuStatus(
                'A2 AA 8E 00 01 A2 BB 8E FF 00 6C FF 00',
                4,
                {
                    remainingCycles: cycles - 1,
                    programCounter: 0x00bb
                }
            );
        });
    });

    describe('Load instructions (LDA, LDX, LDY)', () => {
        it('load X with ABS addr', () => {
            const cycles = 4;
            bus.write(0x0000, 0x7f);

            // LDX $0000
            checkCpuStatus(
                'AE 00 00',
                0,
                {
                    remainingCycles: cycles - 1,
                    x: 0x7f,
                    status: 0b00100000
                }
            );
        });

        it('load Y with IMM addr', () => {
            const cycles = 2;
            // LDY #240
            checkCpuStatus(
                'A0 F0',
                0,
                {
                    remainingCycles: cycles - 1,
                    y: 0xf0,
                    status: 0b10100000
                }
            );
        });

        it.skip('load A with ZP0 addr', () => {
            // TODO: test 0
        });
    });

    describe('Store instructions (STA, STX, STY)', () => {
        it('Store A by ABS', () => {
            const cycles = 4;
            // LDA #100
            // STA $01ff
            checkCpuStatus(
                'A9 64 8D FF 01',
                1,
                {
                    remainingCycles: cycles - 1
                }
            );
            expect(bus.read(0x01ff)).toEqual(0x64);
        });

        it('Store X by ABS', () => {
            const cycles = 4;
            // LDX #100
            // STX $01ff
            checkCpuStatus(
                'A2 64 8E FF 01',
                1,
                {
                    remainingCycles: cycles - 1
                }
            );
            expect(bus.read(0x01ff)).toEqual(0x64);
        });

        it('Store Y by ABS', () => {
            const cycles = 4;
            // LDY #100
            // STY $01ff
            cpuDebugger.loadProgram('A0 64 8C FF 01');
            cpuDebugger.executeInstruction();

            cpu.clock();
            expect(cpu.remainingCycles).toEqual(cycles - 1);

            expect(bus.read(0x01ff)).toEqual(0x64);
        });
    });

    describe('instructionSE*, instructionCL*', () => {
        it('Set CARRY with IMP', () => {
            const cycles = 2;

            // CLC
            // SEC
            cpuDebugger.loadProgram('18 38');
            cpuDebugger.executeInstruction();

            cpu.clock();
            expect(cpu.remainingCycles).toEqual(cycles - 1);

            expect(cpu.getFlag(StatusFlags.CARRY)).toEqual(1);
        });

        it('Set DECIMAL_MODE with IMP', () => {
            const cycles = 2;

            // CLD
            // SED
            cpuDebugger.loadProgram('D8 F8');
            cpuDebugger.executeInstruction();

            cpu.clock();
            expect(cpu.remainingCycles).toEqual(cycles - 1);

            expect(cpu.getFlag(StatusFlags.DECIMAL_MODE)).toEqual(1);
        });

        it('Set DISABLE_INTERRUPTS with IMP', () => {
            const cycles = 2;

            // CLI
            // SEI
            cpuDebugger.loadProgram('58 78');
            cpuDebugger.executeInstruction();

            cpu.clock();
            expect(cpu.remainingCycles).toEqual(cycles - 1);

            expect(cpu.getFlag(StatusFlags.DISABLE_INTERRUPTS)).toEqual(1);
        });

        it('Clear CARRY with IMP', () => {
            const cycles = 2;

            // SEC
            // CLC
            cpuDebugger.loadProgram('38 18');
            cpuDebugger.executeInstruction();

            cpu.clock();
            expect(cpu.remainingCycles).toEqual(cycles - 1);

            expect(cpu.getFlag(StatusFlags.CARRY)).toEqual(0);
        });

        it('Clear DECIMAL_MODE with IMP', () => {
            const cycles = 2;

            // SED
            // CLD
            cpuDebugger.loadProgram('F8 D8');
            cpuDebugger.executeInstruction();

            cpu.clock();
            expect(cpu.remainingCycles).toEqual(cycles - 1);

            expect(cpu.getFlag(StatusFlags.DECIMAL_MODE)).toEqual(0);
        });

        it('Clear DISABLE_INTERRUPTS with IMP', () => {
            const cycles = 2;

            // SEI
            // CLI
            cpuDebugger.loadProgram('78 58');
            cpuDebugger.executeInstruction();

            cpu.clock();
            expect(cpu.remainingCycles).toEqual(cycles - 1);

            expect(cpu.getFlag(StatusFlags.DISABLE_INTERRUPTS)).toEqual(0);
        });

        it('Clear OVERFLOW with IMP', () => {
            const cycles = 2;

            // We can set overflow flag directly
            // So we need to perform some computation
            // LDA #0
            // LDX #255
            // STX $0000
            // ADC $0000
            // CLV
            cpuDebugger.loadProgram('A9 00 A2 FF 8E 00 00 6D 00 00 B8');
            cpuDebugger.executeNInstructions(4);

            cpu.clock();
            expect(cpu.remainingCycles).toEqual(cycles - 1);

            expect(cpu.getFlag(StatusFlags.OVERFLOW)).toEqual(0);
        });
    });

    describe('instructionADC, instructionSBC', () => {
        it('255 + 1 with IMM. Check ZERO, CARRY flags', () => {
            // LDA #255
            // ADC #1
            checkCpuStatus('A9 FF 69 01', 1, {a: 0, status: 0b00100011});
        });

        it('127 + 1 numbers with IMM. Check NEGATIVE, OVERFLOW flag', () => {
            // LDA #127
            // ADC #1
            checkCpuStatus('A9 7F 69 01', 1, {a: 128, status: 0b11100000});
        });

        it('Add 10 + 5 with CARRY with IMM.', () => {
            // LDA #255
            // ADC #1
            // LDA #10
            // ADC #5
            checkCpuStatus('A9 FF 69 01 A9 0A 69 05', 3, {a: 16, status: 0b00100000});
        });

        it('Add two numbers with IMM', () => {
            const cycles = 2;

            // LDA #10
            // ADC #8
            checkCpuStatus(
                'A9 0A 69 08',
                1,
                {
                    remainingCycles: cycles - 1,
                    a: 18,
                    status: 0b00100000
                }
            );
        });

        // TODO: SBC arithmetic tests
        // TODO: test zero underflow

        it.skip('Sub two numbers with ZPO', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 3;
        });

        it.skip('Add two numbers with ZPX', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 4;
        });

        it('Sub two numbers with ABS', () => {
            const cycles = 4;

            // LDX #5
            // STX $0010
            // LDA #10
            // SBC $0010
            checkCpuStatus(
                'A2 05 8E 10 00 A9 0A ED 10 00',
                3,
                {
                    remainingCycles: cycles - 1,
                    // 4 because of carry borrow
                    a: 4,
                    status: 0b00100000
                }
            );
        });

        it.skip('Add two numbers with INX', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 6;
        });

        it.skip('Sub two numbers with INY', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 5;
        });

        it.skip('Add two numbers with INY with page crossed', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 6;
        });
    });

    describe('branch instructions (bcc, bcs, beq, bmi, bne, bpl, bvc, bvs)', () => {
        // TODO what would happen if we cross address space?
        it.skip('BCC Branch if CARRY clear (backwards)', () => {

        });

        it('BCC Do not branch if CARRY set', () => {
            const cycles = 2;

            // SEC
            // BCC $80
            // NOP
            checkCpuStatus(
                '38 90 7D EA',
                1,
                {
                    remainingCycles: cycles - 1,
                    programCounter: initialProgramAddress + 3
                }
            );
        });

        it.skip('BCS Branch if CARRY set (with page crossed)', () => {

        });

        it('BCS Do not branch if CARRY clear', () => {
            const cycles = 2;

            // CLC
            // BCS $7F
            // NOP
            checkCpuStatus(
                '18 B0 7C EA',
                1,
                {
                    remainingCycles: cycles - 1,
                    programCounter: initialProgramAddress + 3
                }
            );
        });

        it.skip('BEQ Branch if ZERO is set (backwards)', () => {

        });

        it('BEQ Do not branch if ZERO is clear', () => {
            const cycles = 2;

            // LDX #1
            // BEQ $7F
            // NOP
            checkCpuStatus(
                'A2 01 F0 7B EA',
                1,
                {
                    remainingCycles: cycles - 1,
                    programCounter: initialProgramAddress + 4
                }
            );
        });

        it.skip('BNE Branch if ZERO flag is clear (with page crossed)', () => {

        });

        it('BNE Do not branch if ZERO flag is set', () => {
            const cycles = 2;

            // LDX #0
            // BNE $7F
            // NOP
            checkCpuStatus(
                'A2 00 D0 7B EA',
                1,
                {
                    remainingCycles: cycles - 1,
                    programCounter: initialProgramAddress + 4
                }
            );
        });

        it.skip('BMI Branch if NEGATIVE is set (backwards)', () => {

        });

        it('BMI Do not branch if negative is clear', () => {
            const cycles = 2;

            // TODO why not jump by ff?
            // LDX #0
            // BMI $FF
            // NOP
            checkCpuStatus(
                'A2 00 30 7C EA',
                1,
                {
                    remainingCycles: cycles - 1,
                    programCounter: initialProgramAddress + 4
                }
            );
        });


        it.skip('BPL Branch if NEGATIVE is clear (with page crossed)', () => {

        });

        it('BPL Do not branch if NEGATIVE is set', () => {
            const cycles = 2;

            // LDX #$FF
            // BPL $2
            // NOP
            checkCpuStatus(
                'A2 FF 10 FE EA',
                1,
                {
                    remainingCycles: cycles - 1,
                    programCounter: initialProgramAddress + 4
                }
            );
        });

        it.skip('BVC Branch if OVERFLOW is clear (backwards)', () => {

        });

        it('BVC Do not branch if OVERFLOW is set', () => {
            const cycles = 2;

            // TODO why cant branch to e2?
            // LDX #127
            // STX $0000
            // LDA #1
            // ADC $0000
            // BVC $1
            // NOP
            checkCpuStatus(
                'A2 7F 8E 00 00 A9 01 6D 00 00 50 F5 EA',
                4,
                {
                    remainingCycles: cycles - 1,
                    programCounter: initialProgramAddress + 12
                }
            );
        });

        it.skip('BVS Branch if OVERFLOW is set (with page crossed)', () => {

        });

        it('BVS Do not branch if OVERFLOW is clear', () => {
            const cycles = 2;

            // TODO why cant branch to e2?
            // CLV
            // BVS $1
            // NOP
            checkCpuStatus(
                'B8 70 FE EA',
                1,
                {
                    remainingCycles: cycles - 1,
                    programCounter: initialProgramAddress + 3
                }
            );
        });
    });

    describe('increment/decrement instructions (dex, dey, dec, inx, iny, inc)', () => {
        it('DEX Decrement X register', () => {
            const cycles = 2;
            // LDX #2
            // DEX
            checkCpuStatus(
                'A2 02 CA',
                1,
                {
                    remainingCycles: cycles - 1,
                    x: 1,
                    status: 0b00100000
                }
            );
        });

        it('DEX Decrement X register and wrap it around', () => {
            const cycles = 2;
            // LDX #0
            // DEX
            checkCpuStatus(
                'A2 00 CA',
                1,
                {
                    remainingCycles: cycles - 1,
                    x: 0xff,
                    status: 0b10100000
                }
            );
        });

        it('INX Increment X register', () => {
            const cycles = 2;
            // LDX #2
            // INX
            checkCpuStatus(
                'A2 02 E8',
                1,
                {
                    remainingCycles: cycles - 1,
                    x: 3,
                    status: 0b00100000
                }
            );
        });

        it('INX Increment X register and wrap it around', () => {
            const cycles = 2;
            // LDX #255
            // INX
            checkCpuStatus(
                'A2 FF E8',
                1,
                {
                    remainingCycles: cycles - 1,
                    x: 0,
                    status: 0b00100010
                }
            );
        });

        it('DEY Decrement Y register', () => {
            const cycles = 2;
            // LDY #2
            // DEY
            checkCpuStatus(
                'A0 02 88',
                1,
                {
                    remainingCycles: cycles - 1,
                    y: 1,
                    status: 0b00100000
                }
            );
        });

        it('DEY Decrement Y register and wrap it around', () => {
            const cycles = 2;
            // LDY #0
            // DEY
            checkCpuStatus(
                'A0 00 88',
                1,
                {
                    remainingCycles: cycles - 1,
                    y: 0xff,
                    status: 0b10100000
                }
            );
        });

        it('INY Increment Y register', () => {
            const cycles = 2;
            // LDY #2
            // INY
            checkCpuStatus(
                'A0 02 C8',
                1,
                {
                    remainingCycles: cycles - 1,
                    y: 3,
                    status: 0b00100000
                }
            );
        });

        it('INY Increment Y register and wrap it around', () => {
            const cycles = 2;
            // LDY #255
            // INY
            checkCpuStatus(
                'A0 FF C8',
                1,
                {
                    remainingCycles: cycles - 1,
                    y: 0,
                    status: 0b00100010
                }
            );
        });

        it('DEC Decrement memory value by ABS', () => {
            const cycles = 6;
            // LDA #2
            // STA 0000
            // DEC 0000
            checkCpuStatus(
                'A9 02 8D 00 00 CE 00 00',
                2,
                {
                    remainingCycles: cycles - 1,
                    status: 0b00100000
                }
            );
            expect(cpu.read(0x0)).toEqual(1);
        });

        it('DEC Decrement memory value and wrap it around by ABS', () => {
            const cycles = 6;
            // LDA #2
            // STA 0000
            // DEC 0000
            checkCpuStatus(
                'A9 00 8D 00 00 CE 00 00',
                2,
                {
                    remainingCycles: cycles - 1,
                    status: 0b10100000
                }
            );
            expect(cpu.read(0x0)).toEqual(255);
        });

        it('INC Increment memory value by ABS', () => {
            const cycles = 6;
            // LDA #2
            // STA 0000
            // INC 0000
            checkCpuStatus(
                'A9 02 8D 00 00 EE 00 00',
                2,
                {
                    remainingCycles: cycles - 1,
                    status: 0b00100000
                }
            );
            expect(cpu.read(0x0)).toEqual(3);
        });

        it('INC Increment memory value and wrap it around by ABS', () => {
            const cycles = 6;
            // LDA #255
            // STA 0000
            // INC 0000
            checkCpuStatus(
                'A9 FF 8D 00 00 EE 00 00',
                2,
                {
                    remainingCycles: cycles - 1,
                    status: 0b00100010
                }
            );
            expect(cpu.read(0x0)).toEqual(0);
        });
    });

    describe('Jump instructions (jsr, jmp, brk, rts, rti)', () => {
        it('instructionJSR', () => {
            const cycles = 6;
            // LDA #2
            // JSR 0
            checkCpuStatus(
                'A9 02 20 03 00',
                1,
                {
                    remainingCycles: cycles - 1,
                    programCounter: 3,
                    stackPointer: CpuConstants.BASE_STACK_OFFSET - 2
                }
            );
            const programCounterShouldBe = CpuDebuggerConstants.BASE_PRG_ADDR + 4;
            expect(cpu.read(STACK_ADDR)).toEqual((programCounterShouldBe >> 8) & 0xff);
            expect(cpu.read(STACK_ADDR - 1)).toEqual(programCounterShouldBe & 0xff);
        });

        it('instructionRTS', () => {
            const cycles = 6;
            // JSR CpuDebuggerConstants.BASE_PRG_ADDR + 3
            // NOP
            // RTS
            checkCpuStatus(
                '20 03 80 EA 60',
                2,
                {
                    remainingCycles: cycles - 1,
                    programCounter: CpuDebuggerConstants.BASE_PRG_ADDR + 3,
                    stackPointer: CpuConstants.BASE_STACK_OFFSET
                }
            );
        });

        it('instructionBRK', () => {
            const cycles = 7;
            cpu.write(CpuConstants.BASE_INTERRUPT_ADDR, 0xcc);
            cpu.write(CpuConstants.BASE_INTERRUPT_ADDR + 1, 0xbb);
            // BRK
            checkCpuStatus(
                '00',
                0,
                {
                    remainingCycles: cycles - 1,
                    programCounter: 0xbbcc,
                    status: 0b00100100
                }
            );
            const pc = CpuDebuggerConstants.BASE_PRG_ADDR + 3; // one for BRK instruction, 1 from IMM mode, and 1 for brk skip
            expect(cpu.read(cpu.stackAddr + 3)).toEqual((pc >>> 8) & 0xff);
            expect(cpu.read(cpu.stackAddr + 2)).toEqual(pc & 0xff);
            expect(cpu.read(cpu.stackAddr + 1)).toEqual(0b00110100);
        });

        it('instructionRTI', () => {
            const cycles = 6;
            cpu.write(CpuConstants.BASE_INTERRUPT_ADDR, 0xcc);
            cpu.write(CpuConstants.BASE_INTERRUPT_ADDR + 1, 0xbb);
            cpu.write(0xbbcc, 0x40);
            // BRK
            // RTI at 0xbbcc
            checkCpuStatus(
                '00',
                1,
                {
                    remainingCycles: cycles - 1,
                    programCounter: CpuDebuggerConstants.BASE_PRG_ADDR + 3,
                    status: 0b00100100,
                    stackPointer: CpuConstants.BASE_STACK_OFFSET
                }
            );
        });

        it('instructionJMP', () => {
            const cycles = 3;
            // JMP $bbcc
            checkCpuStatus(
                '4C CC BB',
                0,
                {
                    remainingCycles: cycles - 1,
                    programCounter: 0xbbcc
                }
            );
        });
    });

    describe('Stack instructions (PHA, PHP, PLA, PLP)', () => {
        it('Push A to the stack with PHA', () => {
            const cycles = 3;
            // LDA #10
            // PHA
            checkCpuStatus(
                'A9 0A 48',
                1,
                {
                    remainingCycles: cycles - 1,
                    stackPointer: CpuConstants.BASE_STACK_OFFSET - 1
                }
            );
            expect(cpu.read(cpu.stackAddr + 1)).toEqual(10);

        });

        it('Push Status to the stack with PHP', () => {
            const cycles = 3;
            // LDA #255
            // PHP
            checkCpuStatus(
                'A9 FF 08',
                1,
                {
                    remainingCycles: cycles - 1,
                    stackPointer: CpuConstants.BASE_STACK_OFFSET - 1
                }
            );
            expect(cpu.read(cpu.stackAddr + 1)).toEqual(0b10110000);
        });

        it('Pulls A from the Stack with PLA', () => {
            const cycles = 4;
            // LDA #255
            // PHA
            // LDA #0
            // PLA
            checkCpuStatus(
                'A9 FF 48 A9 00 68',
                3,
                {
                    remainingCycles: cycles - 1,
                    stackPointer: CpuConstants.BASE_STACK_OFFSET,
                    status: 0b10100000,
                    a: 255
                }
            );
        });

        it('Pulls Status from the Stack with PLP', () => {
            const cycles = 4;
            // LDA #255
            // PHP
            // LDA #0
            // PLP
            checkCpuStatus(
                'A9 FF 08 A9 00 28',
                3,
                {
                    remainingCycles: cycles - 1,
                    stackPointer: CpuConstants.BASE_STACK_OFFSET,
                    status: 0b10110000
                }
            );
        });
    });

    describe('Logical instructions (ALS, LSR, ROL, ROR)', () => {
        it('Perform LSR on memory with carry', () => {
            const cycles = 6;
            // LDA #255
            // STA $0020
            // LSR $0020
            checkCpuStatus(
                'A9 FF 8D 20 00 4E 20 00',
                2,
                {
                    remainingCycles: cycles - 1,
                    status: 0b00100001
                }
            );
            expect(cpu.read(0x20)).toEqual(255 >>> 1);
        });

        it('Perform LSR on accumulator', () => {
            const cycles = 2;
            // LDA #1
            // LSR A
            checkCpuStatus(
                'A9 01 4A',
                1,
                {
                    remainingCycles: cycles - 1,
                    status: 0b00100011,
                    a: 0
                }
            );
        });

        it('Perform ROL on memory with carry', () => {
            const cycles = 6;
            // LDA #3
            // LSR A
            // STA $0020
            // ROL $0020
            checkCpuStatus(
                'A9 03 4A 8D 20 00 2E 20 00',
                3,
                {
                    remainingCycles: cycles - 1,
                    status: 0b00100000
                }
            );
            expect(cpu.read(0x20)).toEqual(3);
        });

        it('Perform ROL on accumulator with overlow', () => {
            const cycles = 2;
            // LDA #255
            // ROL A
            checkCpuStatus(
                'A9 FF 2A',
                1,
                {
                    remainingCycles: cycles - 1,
                    status: 0b10100001,
                    a: (255 << 1) & 0xff
                }
            );
        });

        it('Perform ROR on memory with carry', () => {
            const cycles = 6;
            // LDA #3
            // LSR A
            // STA $0020
            // ROR $0020
            checkCpuStatus(
                'A9 03 4A 8D 20 00 6E 20 00',
                3,
                {
                    remainingCycles: cycles - 1,
                    status: 0b10100001
                }
            );
            expect(cpu.read(0x20)).toEqual(0b10000000);
        });

        it('Perform ROR on accumulator', () => {
            const cycles = 2;
            // LDA #255
            // ROR A
            checkCpuStatus(
                'A9 FF 6A',
                1,
                {
                    remainingCycles: cycles - 1,
                    status: 0b00100001,
                    a: 255 >>> 1
                }
            );
        });

        it('Perform ALS on memory with carry', () => {
            const cycles = 6;
            // LDA #3
            // LSR A
            // STA $0020
            // ASL $0020
            checkCpuStatus(
                'A9 03 4A 8D 20 00 0E 20 00',
                3,
                {
                    remainingCycles: cycles - 1,
                    status: 0b00100000
                }
            );
            expect(cpu.read(0x20)).toEqual(2);
        });

        it('Perform ASL on accumulator with overflow', () => {
            const cycles = 2;
            // LDA #255
            // ASL A
            checkCpuStatus(
                'A9 FF 0A',
                1,
                {
                    remainingCycles: cycles - 1,
                    status: 0b10100001,
                    a: (255 << 1) & 0xff
                }
            );
        });
    });

    describe('Logical instructions (ORA)', () => {
        it('Perform ORA on accumulator with IMM', () => {
            const cycles = 2;
            // LDA #%00100100
            // ORA #%10011001
            checkCpuStatus(
                'A9 24 09 99',
                1,
                {
                    remainingCycles: cycles - 1,
                    a: 0b10111101,
                    status: 0b10100000
                }
            );
        });
    });

    // TODO
    describe('Transfer instructions (TAX, TAY, TSX, TXA, TXS, TYA)', () => {

    });
});
