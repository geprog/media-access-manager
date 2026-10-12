/** Width of `text` at font size `size`, in the same unit as the space it goes into. */
export type MeasureText = (text: string, size: number) => number;

/**
 * Greedy word wrap of `text` into lines no wider than `maxWidth`. A word wider
 * than a whole line is broken inside the word, so nothing ever runs past it.
 */
export function wrapText(text: string, maxWidth: number, width: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (width(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line)
      lines.push(line);
    line = '';
    for (const char of word) {
      if (line && width(line + char) > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line)
    lines.push(line);
  return lines;
}

export interface FittedLabel {
  size: number
  lines: string[]
}

export interface FitLabelOptions {
  maxSize?: number
  minSize?: number
  /** Line distance as a multiple of the font size. */
  lineHeight?: number
}

/**
 * The largest font size, in half steps, at which `text` wraps into the box. A
 * text too long even at `minSize` keeps as many lines as fit and ends in an
 * ellipsis. `null` when the box cannot hold a single line.
 */
export function fitLabel(
  text: string,
  maxWidth: number,
  maxHeight: number,
  measure: MeasureText,
  { maxSize = 12, minSize = 5, lineHeight = 1.2 }: FitLabelOptions = {},
): FittedLabel | null {
  if (!text.trim())
    return null;
  const words = text.split(/\s+/).filter(Boolean);
  // Shrinking far enough to keep whole words beats breaking one apart.
  for (const keepWords of [true, false]) {
    for (let size = maxSize; size >= minSize; size -= 0.5) {
      if (keepWords && words.some(word => measure(word, size) > maxWidth))
        continue;
      const lines = wrapText(text, maxWidth, line => measure(line, size));
      if (lines.length * size * lineHeight <= maxHeight)
        return { size, lines };
    }
  }
  const maxLines = Math.floor(maxHeight / (minSize * lineHeight));
  if (maxLines < 1)
    return null;
  const lines = wrapText(text, maxWidth, line => measure(line, minSize)).slice(0, maxLines);
  let last = lines[maxLines - 1]!;
  while (last && measure(`${last}…`, minSize) > maxWidth)
    last = last.slice(0, -1);
  lines[maxLines - 1] = `${last.trimEnd()}…`;
  return { size: minSize, lines };
}
