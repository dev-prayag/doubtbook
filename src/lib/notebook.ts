export type Entry = {
  id: string;
  question: string;
  imageDataUrl?: string | undefined;
  mode: "solve" | "notes";
  answer: string;
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

/* ---------------- pagination ---------------- */

export type LineKind = "q" | "h" | "step" | "important" | "final" | "diagram" | "p" | "blank";

export type Line = {
  kind: LineKind;
  text: string;
  offset: number; // global char offset for the writing animation
  first: boolean; // first visual line of a block (shows bullet/indent)
};

export type Page = {
  entryIndex: number;
  qNumber: number;
  pageOfEntry: number;
  lines: Line[];
};

function parseKind(raw: string): { kind: LineKind; text: string } {
  const t = raw.trimEnd();
  if (!t.trim()) return { kind: "blank", text: "" };
  const m = /^([#>!=~])\s+(.*)$/.exec(t);
  if (!m) return { kind: "p", text: t.trim() };
  const map: Record<string, LineKind> = {
    "#": "h",
    ">": "step",
    "!": "important",
    "=": "final",
    "~": "diagram",
  };
  return { kind: map[m[1]!]!, text: m[2]!.trim() };
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur.length) cur = w;
    else if (cur.length + 1 + w.length <= max) cur += " " + w;
    else {
      out.push(cur);
      cur = w;
    }
    while (cur.length > max) {
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
    const blocks: Array<{ kind: LineKind; text: string }> = [];
    blocks.push({ kind: "q", text: entry.question || "(question from photo)" });
    blocks.push({ kind: "blank", text: "" });
    for (const raw of entry.answer.split("\n")) blocks.push(parseKind(raw));

    let current: Line[] = [];
    let pageOfEntry = 0;
    const push = () => {
      pages.push({ entryIndex, qNumber: entryIndex + 1, pageOfEntry, lines: current });
      pageOfEntry += 1;
      current = [];
    };

    for (const block of blocks) {
      const indent = block.kind === "q" ? 4 : block.kind === "diagram" ? 0 : 2;
      const visual =
        block.kind === "blank"
          ? [""]
          : block.kind === "diagram"
            ? [block.text]
            : wrap(block.text, Math.max(14, charsPerLine - indent));
      visual.forEach((text, i) => {
        if (current.length >= linesPerPage) push();
        current.push({ kind: block.kind, text, offset, first: i === 0 });
        offset += text.length + 1;
      });
    }
    if (current.length || pageOfEntry === 0) push();
  });

  return { pages, totalChars: offset };
}
