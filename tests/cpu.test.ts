import {CpuDebugger} from '../src/cpu-debugger';
import {StatusFlags} from '../src/cpu';

interface CpuStatus {
    a?: number;
    x?: number;
    y?: number;
    status?: number;
    remainingCycles?: number;
    programCounter?: number;
}

describe('Cpu', () => {
    let cpuDebugger = new CpuDebugger();
    let {cpu, bus} = cpuDebugger;
    let initialProgramAddress = cpu.programCounter;

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

    describe('instructionLD*', () => {
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

        it.skip('load X with ZPY addr', () => {
        });

        it.skip('load X with ABY addr', () => {
            // TODO: test page crossed
        });
    });

    describe('instructionST*', () => {
        it.skip('Store A by ZP0', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 3;
        });

        it.skip('Store X by ZPX', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 4;
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

        it.skip('Store A by ABX', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 5;
        });

        it.skip('Store X by ABY', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 5;
        });

        it.skip('Store Y by INX', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 6;
        });

        it.skip('Store A by INY', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 6;
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

        it.skip('Add 10 + 5 with CARRY with IMM.', () => {

        });

        // TODO: ADC overflow tests

        // TODO: SBC arithmetic tests
        // TODO: test zero underflow

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
            )
        });

        it.skip('Add two numbers with ABX', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 4;
        });

        it.skip('Sub two numbers with ABX with page crossed', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cycles = 5;
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
});
