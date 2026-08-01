export type Ocr = {
  raw: string;
  questions: string[];
};

export type Entry = {
  id: string;
  question: string;
  imageDataUrl?: string | undefined;
  mode: "solve" | "notes";
  answer: string;
  ocr?: Ocr | undefined;
  ocrConfirmed?: boolean | undefined;
};

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  entries: Entry[];
};

const KEY = "doubtbook.chats.v1";

export function loadChats(): Chat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Chat[]) : [];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch {
    return [];
  }
}

export function saveChat(chat: Chat) {
  if (typeof window === "undefined") return;
  const all = loadChats().filter((c) => c.id !== chat.id);
  all.unshift(chat);
  window.localStorage.setItem(KEY, JSON.stringify(all.slice(0, 60)));
}

export function deleteChat(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(loadChats().filter((c) => c.id !== id)));
}

export function getChat(id: string): Chat | undefined {
  return loadChats().find((c) => c.id === id);
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ---------------- inline math segments ---------------- */

export type Segment = { math: boolean; value: string };

export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ math: false, value: text.slice(last, m.index) });
    out.push({ math: true, value: m[1]!.trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ math: false, value: text.slice(last) });
  return out.length ? out : [{ math: false, value: text }];
}

/* ---------------- pagination ---------------- */

export type LineKind =
  | "q"
  | "h"
  | "step"
  | "important"
  | "final"
  | "diagram"
  | "p"
  | "blank"
  | "draw"
  | "gen";

export type Line = {
  kind: LineKind;
  text: string;
  offset: number; // global char offset for the writing animation
  first: boolean; // first visual line of a block (shows bullet/indent)
  qNumber?: number | undefined;
  svg?: string | undefined;
  rows?: number | undefined;
};

export type Page = {
  entryIndex: number;
  qNumber: number;
  pageOfEntry: number;
  lines: Line[];
};

type Block = { kind: LineKind; text: string; svg?: string; rows?: number };

function parseKind(raw: string): Block {
  const t = raw.trimEnd();
  if (!t.trim()) return { kind: "blank", text: "" };
  const m = /^([#>!=~?])\s+(.*)$/.exec(t);
  if (!m) return { kind: "p", text: t.trim() };
  const map: Record<string, LineKind> = {
    "?": "q",
    "#": "h",
    ">": "step",
    "!": "important",
    "=": "final",
    "~": "diagram",
  };
  return { kind: map[m[1]!]!, text: m[2]!.trim() };
}

/** Split answer text into blocks, pulling out [draw]...[/draw] SVG figures. */
function toBlocks(answer: string): Block[] {
  const blocks: Block[] = [];
  const lines = answer.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const open = /^\s*\[draw(?:\s+rows\s*=\s*(\d+))?\]\s*$/.exec(line);
    if (open) {
      const rows = Math.min(14, Math.max(3, Number(open[1] ?? 6) || 6));
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*\[\/draw\]\s*$/.test(lines[i]!)) {
        buf.push(lines[i]!);
        i += 1;
      }
      i += 1; // skip closing tag
      const svg = buf.join("\n").trim();
      if (svg.includes("<svg")) blocks.push({ kind: "draw", text: "", svg, rows });
      continue;
    }
    blocks.push(parseKind(line));
    i += 1;
  }
  return blocks;
}

/** Word tokens where each $...$ math span stays atomic. */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const seg of segments(text)) {
    if (seg.math) tokens.push(`$${seg.value}$`);
    else for (const w of seg.value.split(/\s+/)) if (w) tokens.push(w);
  }
  return tokens;
}

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of tokenize(text)) {
    if (!cur.length) cur = w;
    else if (cur.length + 1 + w.length <= max) cur += " " + w;
    else {
      out.push(cur);
      cur = w;
    }
    while (cur.length > max && !cur.startsWith("$")) {
      out.push(cur.slice(0, max));
      cur = cur.slice(max);
    }
  }
  if (cur.length) out.push(cur);
  return out.length ? out : [""];
}

export function paginate(
  entries: Entry[],
  opts: { charsPerLine: number; linesPerPage: number },
): { pages: Page[]; totalChars: number } {
  const { charsPerLine, linesPerPage } = opts;
  const pages: Page[] = [];
  let offset = 0;

  entries.forEach((entry, entryIndex) => {
    const blocks: Block[] = [];
    if (!entry.answer.trim()) {
      const pendingOcr = !!entry.imageDataUrl && !entry.ocrConfirmed;
      blocks.push({
        kind: "gen",
        text: pendingOcr ? "Reading the photo" : "Generating",
      });
    } else {
      blocks.push(...toBlocks(entry.answer));
    }

    let current: Line[] = [];
    let pageOfEntry = 0;
    let qCount = 0;
    const push = () => {
      pages.push({ entryIndex, qNumber: entryIndex + 1, pageOfEntry, lines: current });
      pageOfEntry += 1;
      current = [];
    };

    for (const block of blocks) {
      if (block.kind === "draw") {
        const rows = block.rows ?? 6;
        if (current.length + rows > linesPerPage && current.length) push();
        current.push({
          kind: "draw",
          text: "",
          offset,
          first: true,
          svg: block.svg,
          rows: Math.min(rows, linesPerPage),
        });
        offset += 40;
        for (let k = 1; k < Math.min(rows, linesPerPage); k += 1) {
          if (current.length >= linesPerPage) break;
          current.push({ kind: "blank", text: "", offset, first: false });
        }
        continue;
      }
      const isQ = block.kind === "q";
      if (isQ) qCount += 1;
      const indent = isQ ? 4 : block.kind === "diagram" ? 0 : 2;
      const visual =
        block.kind === "blank"
          ? [""]
          : block.kind === "diagram"
            ? [block.text]
            : wrap(block.text, Math.max(14, charsPerLine - indent));
      visual.forEach((text, i) => {
        if (current.length >= linesPerPage) push();
        const line: Line = { kind: block.kind, text, offset, first: i === 0 };
        if (isQ) line.qNumber = qCount;
        current.push(line);
        offset += text.length + 1;
      });
    }
    if (current.length || pageOfEntry === 0) push();
  });

  return { pages, totalChars: offset };
}
