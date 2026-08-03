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

const MACRO =
  /\\(?:[a-zA-Z]+)(?:\s*\{[^{}]*\}|\s*\[[^\]]*\]|\^\{?[^\s{}$]+\}?|_\{?[^\s{}$]+\}?)*/g;

/** Rewrites any stray math the model emitted into plain inline $...$ spans. */
function normalizeOutsideMath(chunk: string): string {
  let s = chunk;
  // sqrt(...) / x^2 style ASCII math -> LaTeX macros
  s = s.replace(/\bsqrt\s*\(([^()]*)\)/gi, "\\sqrt{$1}");
  s = s.replace(/([A-Za-z0-9)\]}])\^(-?\d+|\{[^{}]*\}|[A-Za-z])/g, (_m, base, exp) => {
    const e = String(exp).replace(/^\{|\}$/g, "");
    return `\\mathrm{${base}}^{${e}}`;
  });
  // wrap every remaining LaTeX macro run in dollars
  s = s.replace(MACRO, (m) => `$${m.trim()}$`);
  // merge dollars that ended up adjacent, e.g. "$\frac{1}{2}$$\sqrt{3}$"
  s = s.replace(/\$\s*\$/g, " ");
  return s;
}

/** Strips display-math delimiters so only inline $...$ ever reaches KaTeX. */
export function normalizeMath(text: string): string {
  let s = text
    .replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner) => `$${String(inner).trim()}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `$${String(inner).trim()}$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${String(inner).trim()}$`)
    .replace(/\\begin\{(?:align|equation|gather)\*?\}([\s\S]*?)\\end\{(?:align|equation|gather)\*?\}/g,
      (_m, inner) => `$${String(inner).replace(/\\\\|&/g, " ").trim()}$`);

  // walk the string, leaving existing $...$ spans untouched
  let out = "";
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("$", i);
    if (open === -1) {
      out += normalizeOutsideMath(s.slice(i));
      break;
    }
    const close = s.indexOf("$", open + 1);
    if (close === -1) {
      out += normalizeOutsideMath(s.slice(i));
      break;
    }
    out += normalizeOutsideMath(s.slice(i, open));
    out += s.slice(open, close + 1);
    i = close + 1;
  }
  s = out;
  return s.replace(/\$\s*\$/g, " ").replace(/[ \t]{2,}/g, " ");
}

export function segments(text: string): Segment[] {
  const src = normalizeMath(text);
  const out: Segment[] = [];
  const re = /\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ math: false, value: src.slice(last, m.index) });
    out.push({ math: true, value: m[1]!.trim() });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ math: false, value: src.slice(last) });
  return out.length ? out : [{ math: false, value: src }];
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
  used: number;

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
      const rows = Math.min(16, Math.max(4, Number(open[1] ?? 8) || 8));
      const buf: string[] = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        if (/^\s*\[\/draw\]\s*$/.test(lines[i]!)) {
          closed = true;
          i += 1;
          break;
        }
        buf.push(lines[i]!);
        i += 1;
      }
      const svg = buf.join("\n").trim();
      if (closed && svg.includes("<svg")) blocks.push({ kind: "draw", text: "", svg, rows });
      else if (!closed) blocks.push({ kind: "gen", text: "Drawing the figure" });

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

/**
 * Approximate on-screen width of a token in "character" units.
 * A `$...$` span is rendered by KaTeX at ~0.86em with all the LaTeX
 * plumbing (\frac, braces, ^, _) invisible, so its raw source length
 * hugely overestimates the space it takes — that was causing early
 * line breaks and lots of empty space on the right.
 */
export function visualWidth(token: string): number {
  if (!(token.startsWith("$") && token.endsWith("$") && token.length > 2)) return token.length;
  let s = token.slice(1, -1);
  s = s.replace(/\\(?:left|right|,|;|!|:|quad|qquad|displaystyle|limits)/g, "");
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a, b) =>
    String(a).length >= String(b).length ? String(a) : String(b),
  );
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "v$1");
  s = s.replace(/\\[a-zA-Z]+/g, "x"); // symbols/macros render as ~1 glyph
  s = s.replace(/[{}^_&\\]/g, "");
  return Math.max(1, Math.round(s.length * 0.86));
}

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  let width = 0;
  for (const w of tokenize(text)) {
    const ww = visualWidth(w);
    if (!cur.length) {
      cur = w;
      width = ww;
    } else if (width + 1 + ww <= max) {
      cur += " " + w;
      width += 1 + ww;
    } else {
      out.push(cur);
      cur = w;
      width = ww;
    }
    while (width > max && !cur.startsWith("$")) {
      out.push(cur.slice(0, max));
      cur = cur.slice(max);
      width = visualWidth(cur);
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
    let used = 0;
    let pageOfEntry = 0;
    let qCount = 0;
    const push = () => {
      pages.push({ entryIndex, qNumber: entryIndex + 1, pageOfEntry, lines: current, used });
      pageOfEntry += 1;
      current = [];
      used = 0;
    };

    for (const block of blocks) {
      if (block.kind === "draw") {
        const rows = Math.min(block.rows ?? 6, linesPerPage);
        if (used + rows > linesPerPage && used) push();
        current.push({ kind: "draw", text: "", offset, first: true, svg: block.svg, rows });
        used += rows;
        offset += 40;
        continue;
      }
      const isQ = block.kind === "q";
      if (isQ) qCount += 1;
      // bold ink (question/heading/important/final) renders wider per glyph,
      // so reserve a little more room for those blocks
      const bold = isQ || ["h", "important", "final"].includes(block.kind);
      const indent = isQ ? 8 : bold ? 8 : block.kind === "diagram" ? 0 : 2;
      const visual =
        block.kind === "blank"
          ? [""]
          : block.kind === "diagram"
            ? [block.text]
            : wrap(block.text, Math.max(14, charsPerLine - indent));
      visual.forEach((text, i) => {
        if (used >= linesPerPage) push();
        const line: Line = { kind: block.kind, text, offset, first: i === 0 };
        if (isQ) line.qNumber = qCount;
        current.push(line);
        used += 1;
        offset += text.length + 1;
      });
    }

    if (current.length || pageOfEntry === 0) push();
  });

  return { pages, totalChars: offset };
}

/* ---------------- math inside SVG figures ---------------- */

const SUP: Record<string, string> = {
  "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074",
  "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079",
  "+": "\u207a", "-": "\u207b", "(": "\u207d", ")": "\u207e", n: "\u207f", i: "\u2071",
};
const SUB: Record<string, string> = {
  "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084",
  "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089",
  "+": "\u208a", "-": "\u208b", "(": "\u208d", ")": "\u208e",
  a: "\u2090", e: "\u2091", n: "\u2099", x: "\u2093",
};
const SYMBOLS: Record<string, string> = {
  alpha: "\u03b1", beta: "\u03b2", gamma: "\u03b3", delta: "\u03b4", Delta: "\u0394",
  theta: "\u03b8", lambda: "\u03bb", mu: "\u03bc", pi: "\u03c0", rho: "\u03c1",
  sigma: "\u03c3", tau: "\u03c4", phi: "\u03c6", omega: "\u03c9", Omega: "\u03a9",
  times: "\u00d7", cdot: "\u00b7", div: "\u00f7", pm: "\u00b1", mp: "\u2213",
  leq: "\u2264", geq: "\u2265", neq: "\u2260", approx: "\u2248", infty: "\u221e",
  rightarrow: "\u2192", to: "\u2192", leftarrow: "\u2190", leftrightarrow: "\u2194",
  Rightarrow: "\u21d2", degree: "\u00b0", circ: "\u00b0", sum: "\u2211", int: "\u222b",
  partial: "\u2202", propto: "\u221d", ldots: "\u2026", dots: "\u2026", prime: "\u2032",
};

function script(body: string, map: Record<string, string>): string {
  const chars = [...body];
  if (chars.every((c) => map[c])) return chars.map((c) => map[c]!).join("");
  return (map === SUP ? "^" : "_") + body;
}

/**
 * Converts LaTeX to readable Unicode math for contexts that cannot run KaTeX
 * (SVG <text> labels inside drawn tables, graphs and diagrams).
 */
export function mathToUnicode(input: string): string {
  let s = input;
  s = s.replace(/\$+/g, "");
  s = s.replace(/\\(?:left|right|displaystyle|limits|!|,|;|:)/g, "");
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, "$1");
  for (let pass = 0; pass < 3; pass += 1) {
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "\u221a($1)");
  }
  s = s.replace(/\\([a-zA-Z]+)/g, (m, name: string) => SYMBOLS[name] ?? name);
  s = s.replace(/\^\{([^{}]*)\}/g, (_m, b: string) => script(b, SUP));
  s = s.replace(/\^(-?\w)/g, (_m, b: string) => script(b, SUP));
  s = s.replace(/_\{([^{}]*)\}/g, (_m, b: string) => script(b, SUB));
  s = s.replace(/_(-?\w)/g, (_m, b: string) => script(b, SUB));
  s = s.replace(/[{}]/g, "");
  s = s.replace(/\(\(([^()]*)\)\)/g, "($1)");
  return s.replace(/[ \t]{2,}/g, " ").trim();
}
