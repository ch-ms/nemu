/*
 * Lookup table for instructions and their addressing modes and cycles
 * See: http://www.oxyron.de/html/opcodes02.html
 */

type LegalInstructionMnemonic = 'BRK' | 'SED' | 'ORA' | 'NOP' | 'ASL' | 'PHP' | 'BPL' |
    'CLC' | 'JSR' | 'AND' | 'BIT' | 'ROL' | 'PLP' | 'BMI' |
    'SEC' | 'RTI' | 'EOR' | 'LSR' | 'PHA' | 'JMP' | 'BVC' |
    'CLI' | 'RTS' | 'ADC' | 'ROR' | 'PLA' | 'BVS' | 'SEI' |
    'STA' | 'STY' | 'STX' | 'DEY' | 'TXA' | 'BCC' | 'TYA' |
    'TXS' | 'LDY' | 'LDA' | 'LDX' | 'TAY' | 'TAX' | 'BCS' |
    'CLV' | 'TSX' | 'CPY' | 'CMP' | 'DEC' | 'INY' | 'DEX' |
    'BNE' | 'CLD' | 'CPX' | 'SBC' | 'INC' | 'INX' | 'BEQ';

type IllegalInstructionMnemonic = 'LAX' | 'SAX' | 'DCP' | 'ISC' | 'SLO' | 'RLA' |
    'SRE' | 'RRA' | 'ALR' | 'ANC' | 'STP' | 'AXS' | 'LAS' |
    'ARR' | 'XAA' | 'AHX' | 'TAS' | 'SHX';

type InstructionMnemonic = LegalInstructionMnemonic | IllegalInstructionMnemonic;

type AddrModeMnemonic = 'IMM' | 'IZX' | 'IMP' | 'ZP0' | 'ABS' | 'REL' | 'IZY' |
    'ZPX' | 'ABY' | 'ABX' | 'IND' | 'ZPY';

type LookupEntry = [InstructionMnemonic, AddrModeMnemonic, number];

// This is 16x16 matrix, but rows are oganized in 4x4 matrix for convinience of reading
const LOOKUP: LookupEntry[] = [
    ['BRK', 'IMM', 7],['ORA', 'IZX', 6],['STP', 'IMP', 2],['SLO', 'IZX', 8],
    ['NOP', 'ZP0', 3],['ORA', 'ZP0', 3],['ASL', 'ZP0', 5],['SLO', 'ZP0', 5],
    ['PHP', 'IMP', 3],['ORA', 'IMM', 2],['ASL', 'IMP', 2],['ANC', 'IMM', 2],
    ['NOP', 'ABS', 4],['ORA', 'ABS', 4],['ASL', 'ABS', 6],['SLO', 'ABS', 6],

    ['BPL', 'REL', 2],['ORA', 'IZY', 5],['STP', 'IMP', 2],['SLO', 'IZY', 8],
    ['NOP', 'ZPX', 4],['ORA', 'ZPX', 4],['ASL', 'ZPX', 6],['SLO', 'ZPX', 6],
    ['CLC', 'IMP', 2],['ORA', 'ABY', 4],['NOP', 'IMP', 2],['SLO', 'ABY', 7],
    ['NOP', 'ABX', 4],['ORA', 'ABX', 4],['ASL', 'ABX', 7],['SLO', 'ABX', 7],


    ['JSR', 'ABS', 6],['AND', 'IZX', 6],['STP', 'IMP', 2],['RLA', 'IZX', 8],
    ['BIT', 'ZP0', 3],['AND', 'ZP0', 3],['ROL', 'ZP0', 5],['RLA', 'ZP0', 5],
    ['PLP', 'IMP', 4],['AND', 'IMM', 2],['ROL', 'IMP', 2],['ANC', 'IMM', 2],
    ['BIT', 'ABS', 4],['AND', 'ABS', 4],['ROL', 'ABS', 6],['RLA', 'ABS', 6],

    ['BMI', 'REL', 2],['AND', 'IZY', 5],['STP', 'IMP', 2],['RLA', 'IZY', 8],
    ['NOP', 'ZPX', 4],['AND', 'ZPX', 4],['ROL', 'ZPX', 6],['RLA', 'ZPX', 6],
    ['SEC', 'IMP', 2],['AND', 'ABY', 4],['NOP', 'IMP', 2],['RLA', 'ABY', 7],
    ['NOP', 'ABX', 4],['AND', 'ABX', 4],['ROL', 'ABX', 7],['RLA', 'ABX', 7],


    ['RTI', 'IMP', 6],['EOR', 'IZX', 6],['STP', 'IMP', 2],['SRE', 'IZX', 8],
    ['NOP', 'ZP0', 3],['EOR', 'ZP0', 3],['LSR', 'ZP0', 5],['SRE', 'ZP0', 5],
    ['PHA', 'IMP', 3],['EOR', 'IMM', 2],['LSR', 'IMP', 2],['ALR', 'IMM', 2],
    ['JMP', 'ABS', 3],['EOR', 'ABS', 4],['LSR', 'ABS', 6],['SRE', 'ABS', 6],

    ['BVC', 'REL', 2],['EOR', 'IZY', 5],['STP', 'IMP', 2],['SRE', 'IZY', 8],
    ['NOP', 'ZPX', 4],['EOR', 'ZPX', 4],['LSR', 'ZPX', 6],['SRE', 'ZPX', 6],
    ['CLI', 'IMP', 2],['EOR', 'ABY', 4],['NOP', 'IMP', 2],['SRE', 'ABY', 7],
    ['NOP', 'ABX', 4],['EOR', 'ABX', 4],['LSR', 'ABX', 7],['SRE', 'ABX', 7],


    ['RTS', 'IMP', 6],['ADC', 'IZX', 6],['STP', 'IMP', 2],['RRA', 'IZX', 8],
    ['NOP', 'ZP0', 3],['ADC', 'ZP0', 3],['ROR', 'ZP0', 5],['RRA', 'ZP0', 5],
    ['PLA', 'IMP', 4],['ADC', 'IMM', 2],['ROR', 'IMP', 2],['ARR', 'IMM', 2],
    ['JMP', 'IND', 5],['ADC', 'ABS', 4],['ROR', 'ABS', 6],['RRA', 'ABS', 6],

    ['BVS', 'REL', 2],['ADC', 'IZY', 5],['STP', 'IMP', 2],['RRA', 'IZY', 8],
    ['NOP', 'ZPX', 4],['ADC', 'ZPX', 4],['ROR', 'ZPX', 6],['RRA', 'ZPX', 6],
    ['SEI', 'IMP', 2],['ADC', 'ABY', 4],['NOP', 'IMP', 2],['RRA', 'ABY', 7],
    ['NOP', 'ABX', 4],['ADC', 'ABX', 4],['ROR', 'ABX', 7],['RRA', 'ABX', 7],


    ['NOP', 'IMM', 2],['STA', 'IZX', 6],['NOP', 'IMM', 2],['SAX', 'IZX', 6],
    ['STY', 'ZP0', 3],['STA', 'ZP0', 3],['STX', 'ZP0', 3],['SAX', 'ZP0', 3],
    ['DEY', 'IMP', 2],['NOP', 'IMM', 2],['TXA', 'IMP', 2],['XAA', 'IMM', 2],
    ['STY', 'ABS', 4],['STA', 'ABS', 4],['STX', 'ABS', 4],['SAX', 'ABS', 4],

    ['BCC', 'REL', 2],['STA', 'IZY', 6],['STP', 'IMP', 2],['AHX', 'IZY', 6],
    ['STY', 'ZPX', 4],['STA', 'ZPX', 4],['STX', 'ZPY', 4],['SAX', 'ZPY', 4],
    ['TYA', 'IMP', 2],['STA', 'ABY', 5],['TXS', 'IMP', 2],['TAS', 'ABY', 5],
    ['NOP', 'ABX', 5],['STA', 'ABX', 5],['SHX', 'ABY', 5],['AHX', 'ABY', 5],


    ['LDY', 'IMM', 2],['LDA', 'IZX', 6],['LDX', 'IMM', 2],['LAX', 'IZX', 6],
    ['LDY', 'ZP0', 3],['LDA', 'ZP0', 3],['LDX', 'ZP0', 3],['LAX', 'ZP0', 3],
    ['TAY', 'IMP', 2],['LDA', 'IMM', 2],['TAX', 'IMP', 2],['LAX', 'IMM', 2],
    ['LDY', 'ABS', 4],['LDA', 'ABS', 4],['LDX', 'ABS', 4],['LAX', 'ABS', 4],

    ['BCS', 'REL', 2],['LDA', 'IZY', 5],['STP', 'IMP', 2],['LAX', 'IZY', 5],
    ['LDY', 'ZPX', 4],['LDA', 'ZPX', 4],['LDX', 'ZPY', 4],['LAX', 'ZPY', 4],
    ['CLV', 'IMP', 2],['LDA', 'ABY', 4],['TSX', 'IMP', 2],['LAS', 'ABY', 4],
    ['LDY', 'ABX', 4],['LDA', 'ABX', 4],['LDX', 'ABY', 4],['LAX', 'ABY', 4],


    ['CPY', 'IMM', 2],['CMP', 'IZX', 6],['NOP', 'IMM', 2],['DCP', 'IZX', 8],
    ['CPY', 'ZP0', 3],['CMP', 'ZP0', 3],['DEC', 'ZP0', 5],['DCP', 'ZP0', 5],
    ['INY', 'IMP', 2],['CMP', 'IMM', 2],['DEX', 'IMP', 2],['AXS', 'IMM', 2],
    ['CPY', 'ABS', 4],['CMP', 'ABS', 4],['DEC', 'ABS', 6],['DCP', 'ABS', 6],

    ['BNE', 'REL', 2],['CMP', 'IZY', 5],['STP', 'IMP', 2],['DCP', 'IZY', 8],
    ['NOP', 'ZPX', 4],['CMP', 'ZPX', 4],['DEC', 'ZPX', 6],['DCP', 'ZPX', 6],
    ['CLD', 'IMP', 2],['CMP', 'ABY', 4],['NOP', 'IMP', 2],['DCP', 'ABY', 7],
    ['NOP', 'ABX', 4],['CMP', 'ABX', 4],['DEC', 'ABX', 7],['DCP', 'ABX', 7],


    ['CPX', 'IMM', 2],['SBC', 'IZX', 6],['NOP', 'IMM', 2],['ISC', 'IZX', 8],
    ['CPX', 'ZP0', 3],['SBC', 'ZP0', 3],['INC', 'ZP0', 5],['ISC', 'ZP0', 5],
    ['INX', 'IMP', 2],['SBC', 'IMM', 2],['NOP', 'IMP', 2],['SBC', 'IMM', 2],
    ['CPX', 'ABS', 4],['SBC', 'ABS', 4],['INC', 'ABS', 6],['ISC', 'ABS', 6],

    ['BEQ', 'REL', 2],['SBC', 'IZY', 5],['STP', 'IMP', 2],['ISC', 'IZY', 8],
    ['NOP', 'ZPX', 4],['SBC', 'ZPX', 4],['INC', 'ZPX', 6],['ISC', 'ZPX', 6],
    ['SED', 'IMP', 2],['SBC', 'ABY', 4],['NOP', 'IMP', 2],['ISC', 'ABY', 7],
    ['NOP', 'ABX', 4],['SBC', 'ABX', 4],['INC', 'ABX', 7],['ISC', 'ABX', 7]
];

export {LOOKUP, InstructionMnemonic, AddrModeMnemonic};
