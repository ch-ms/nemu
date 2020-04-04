type Color = [number, number, number];
type ColorQuad = [Color, Color, Color, Color];

const stringifyColorCache = new Map<Color, string>();

function stringifyColor(color: Color): string {
    const cached = stringifyColorCache.get(color);
    if (cached) {
        return cached;
    }

    const s = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    stringifyColorCache.set(color, s);
    return s;
}

export {Color, ColorQuad, stringifyColor};
