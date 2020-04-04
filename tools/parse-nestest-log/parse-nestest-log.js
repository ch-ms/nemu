const fs = require('fs');
const path = require('path');

const PARSER_REG = /^([ABCDEF\d]+)\s+([ABCDEF\d\s]+)\s+(\*?[A-Z]{3}\s[#$ABCDEFXY=@\(\)\s\d,]+)\s+A:([ABCDEF\d]{2})\sX:([ABCDEF\d]{2})\sY:([ABCDEF\d]{2})\sP:([ABCDEF\d]{2})\sSP:([ABCDEF\d]{2})\sPPU:[\s\d]+,[\s\d]+CYC:(\d+)/;
function parseLogLine(logLine) {
    // http://forums.nesdev.com/viewtopic.php?f=3&t=19117
    const match = logLine.match(PARSER_REG);
    if (!match) {
        throw new Error(`Can't parse log entry: "${logLine}"`);
    }

    // eslint-disable-next-line
    const [_, programCounter, rawOperation, resolvedOperation, a, x, y, p, sp, cyc] = match;

    return {
        programCounter: parseInt(programCounter, 16),
        a: parseInt(a, 16),
        x: parseInt(x, 16),
        y: parseInt(y, 16),
        status: parseInt(p, 16),
        sp: parseInt(sp, 16),
        cyc: parseInt(cyc, 16),
        resolvedOperation: resolvedOperation.trim()
    }
}

const result = fs.readFileSync(path.join(__dirname, './nestest.log.txt'))
    .toString()
    .trim()
    .split('\n')
    .map((line, i) => ({line: i + 1, ...parseLogLine(line)}));

console.log(JSON.stringify(result, null, 4));
