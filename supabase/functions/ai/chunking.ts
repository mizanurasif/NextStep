// Structure-aware chunking: split at the document's own sections, and only split a section further
// (paragraphs → lines → sentences, with a little overlap) when it's too long to embed well.
// Every chunk starts with a label line, so "3+ years of React" still says which job it belongs to.

// About 500 tokens; long enough for a whole section, short enough that one chunk is about one thing
const MAX_CHUNK_CHARS = 2000;
// Carried into the next piece when a section is split, so a sentence cut at the edge keeps its context
const OVERLAP_CHARS = 200;
const SEPARATORS = ["\n\n", "\n", ". "];

export type ChunkSource = "circular" | "notes";

export type Chunk = {
  source: ChunkSource;
  section: string;
  content: string;
};

export type IndexInput = {
  applicationId: string;
  type: "job" | "university" | "professor";
  title: string;
  organization: string;
  notes: string | null;
  circular: { text: string; headings: string[] } | null;
};

const TYPE_LABEL: Record<IndexInput["type"], string> = {
  job: "Job",
  university: "University program",
  professor: "Professor",
};

// Splits the text at the headings found when the circular was read (in order, case-insensitive).
// Text before the first heading becomes "Overview"
export const splitSections = (source: string, headings: string[]) => {
  const lower = source.toLowerCase();
  const starts: { heading: string; index: number }[] = [];
  let from = 0;
  for (const heading of headings) {
    const index = lower.indexOf(heading.toLowerCase().trim(), from);
    if (index === -1) continue;
    starts.push({ heading: heading.trim(), index });
    from = index + heading.length;
  }

  const sections: { heading: string; text: string }[] = [];
  const intro = source.slice(0, starts[0]?.index ?? source.length).trim();
  if (intro) sections.push({ heading: "Overview", text: intro });
  starts.forEach((start, i) => {
    const body = source.slice(start.index + start.heading.length, starts[i + 1]?.index ?? source.length).trim();
    if (body) sections.push({ heading: start.heading, text: body });
  });
  return sections;
};

// Joins pieces back together greedily, up to the size limit
const pack = (pieces: string[], separator: string) => {
  const packed: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const next = current ? current + separator + piece : piece;
    if (next.length <= MAX_CHUNK_CHARS) {
      current = next;
      continue;
    }
    if (current) packed.push(current);
    current = piece;
  }
  if (current) packed.push(current);
  return packed;
};

// Recursive split: try paragraphs first, then lines, then sentences; a hard cut only as a last resort
const splitText = (text: string, level = 0): string[] => {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const separator = SEPARATORS[level];
  if (!separator) {
    const cuts: string[] = [];
    for (let i = 0; i < text.length; i += MAX_CHUNK_CHARS) cuts.push(text.slice(i, i + MAX_CHUNK_CHARS));
    return cuts;
  }
  const pieces = text
    .split(separator)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .flatMap((piece) => (piece.length > MAX_CHUNK_CHARS ? splitText(piece, level + 1) : [piece]));
  return pack(pieces, separator);
};

// Starts each piece after the first with the end of the one before it, from a word boundary
const withOverlap = (pieces: string[]) =>
  pieces.map((piece, i) => {
    if (i === 0) return piece;
    const tail = pieces[i - 1].slice(-OVERLAP_CHARS);
    const fromWord = tail.slice(tail.indexOf(" ") + 1);
    return `…${fromWord}\n${piece}`;
  });

export const buildChunks = (input: IndexInput): Chunk[] => {
  const label = `${TYPE_LABEL[input.type]}: ${input.title} — ${input.organization}`;
  const chunks: Chunk[] = [];

  if (input.circular) {
    for (const section of splitSections(input.circular.text, input.circular.headings)) {
      for (const piece of withOverlap(splitText(section.text))) {
        chunks.push({ source: "circular", section: section.heading, content: `${label}\nSection: ${section.heading}\n\n${piece}` });
      }
    }
  }
  if (input.notes) {
    for (const piece of withOverlap(splitText(input.notes))) {
      chunks.push({ source: "notes", section: "My notes", content: `${label}\nSection: My notes\n\n${piece}` });
    }
  }
  return chunks;
};
