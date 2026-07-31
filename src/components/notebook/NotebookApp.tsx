import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Menu,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { NotebookPage } from "./NotebookPage";
import { LassoLayer, type LassoSelection } from "./LassoLayer";
import {
  deleteChat,
  getChat,
  loadChats,
  newId,
  paginate,
  saveChat,
  type Chat,
  type Entry,
} from "@/lib/notebook";

function persist(chat: Chat) {
  try {
    saveChat(chat);
  } catch {
    saveChat({ ...chat, entries: chat.entries.map((e) => ({ ...e, imageDataUrl: undefined })) });
  }
}

export function NotebookApp({ chatId }: { chatId: string }) {
  const navigate = useNavigate();
  const [chat, setChat] = useState<Chat | null>(null);
  const [dims, setDims] = useState({ charsPerLine: 44, linesPerPage: 14 });
  const [pageIndex, setPageIndex] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"solve" | "notes">("solve");
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [lasso, setLasso] = useState(false);
  const [selection, setSelection] = useState<LassoSelection | null>(null);
  const [lassoInput, setLassoInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const animating = useRef(false);
  const started = useRef<string | null>(null);

  /* ---------- load chat ---------- */
  useEffect(() => {
    const existing = getChat(chatId);
    const c = existing ?? { id: chatId, title: "New doubt", createdAt: Date.now(), entries: [] };
    setChat(c);
    setChats(loadChats());
    const pending = c.entries[c.entries.length - 1];
    animating.current = !!pending && pending.answer === "";
    setReveal(animating.current ? 0 : Number.MAX_SAFE_INTEGER);
  }, [chatId]);

  /* ---------- measure the sheet ---------- */
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const measure = () => {
      const rule = parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.2;
      const probe = document.createElement("div");
      probe.className = "hand-line";
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.textContent = "n".repeat(60);
      el.appendChild(probe);
      const charWidth = probe.getBoundingClientRect().width / 60 || 10;
      probe.remove();
      const width = el.clientWidth - 64;
      setDims({
        charsPerLine: Math.max(18, Math.floor(width / charWidth)),
        linesPerPage: Math.max(8, Math.floor((el.clientHeight - 6) / rule)),
      });
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { pages, totalChars } = useMemo(
    () => paginate(chat?.entries ?? [], dims),
    [chat?.entries, dims],
  );

  /* ---------- handwriting animation ---------- */
  useEffect(() => {
    if (reveal >= totalChars) return;
    const id = window.setInterval(() => {
      setReveal((r) => Math.min(totalChars, r + 5));
    }, 24);
    return () => window.clearInterval(id);
  }, [reveal, totalChars]);

  /* ---------- follow the pen ---------- */
  useEffect(() => {
    if (!animating.current || reveal >= Number.MAX_SAFE_INTEGER) return;
    let idx = 0;
    pages.forEach((p, i) => {
      const first = p.lines[0]?.offset ?? 0;
      if (first <= reveal) idx = i;
    });
    setPageIndex(idx);
  }, [reveal, pages]);

  useEffect(() => {
    if (pageIndex > Math.max(0, pages.length - 1)) setPageIndex(Math.max(0, pages.length - 1));
  }, [pages.length, pageIndex]);

  /* ---------- streaming ---------- */
  const stream = useCallback(
    async (
      body: Record<string, unknown>,
      onChunk: (chunk: string) => void,
      onDone: () => void,
    ) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/solve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          setError(
            res.status === 429
              ? "Too many questions right now — try again in a moment."
              : res.status === 402
                ? "AI credits are exhausted for this workspace."
                : "The AI could not answer that. Please try again.",
          );
          return;
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) onChunk(value);
        }
      } catch {
        setError("Network problem while writing the answer.");
      } finally {
        setBusy(false);
        onDone();
      }
    },
    [],
  );

  const runEntry = useCallback(
    async (entry: Entry, priorContext: string) => {
      animating.current = true;
      await stream(
        {
          mode: entry.mode,
          question: entry.question,
          imageDataUrl: entry.imageDataUrl,
          context: priorContext,
        },
        (chunk) => {
          setChat((c) => {
            if (!c) return c;
            const entries = c.entries.map((e) =>
              e.id === entry.id ? { ...e, answer: e.answer + chunk } : e,
            );
            return { ...c, entries };
          });
        },
        () => {
          setChat((c) => {
            if (c) persist(c);
            setChats(loadChats());
            return c;
          });
        },
      );
    },
    [stream],
  );

  /* ---------- auto-run a pending question ---------- */
  useEffect(() => {
    if (!chat) return;
    const last = chat.entries[chat.entries.length - 1];
    if (!last || last.answer !== "" || busy || started.current === last.id) return;
    started.current = last.id;
    const prior = chat.entries
      .slice(0, -1)
      .map((e) => `Q: ${e.question}\n${e.answer}`)
      .join("\n\n");
    void runEntry(last, prior);
  }, [chat, busy, runEntry]);

  const ask = () => {
    if (!chat || busy || (!input.trim() && !image)) return;
    const entry: Entry = {
      id: newId(),
      question: input.trim() || "Solve the question in this photo.",
      imageDataUrl: image,
      mode,
      answer: "",
    };
    const next: Chat = {
      ...chat,
      title: chat.entries.length === 0 ? entry.question.slice(0, 60) : chat.title,
      entries: [...chat.entries, entry],
    };
    setChat(next);
    persist(next);
    setInput("");
    setImage(undefined);
    setLasso(false);
    inputRef.current?.focus();
  };

  const askLasso = () => {
    if (!chat || !selection || busy || !lassoInput.trim()) return;
    const last = chat.entries[chat.entries.length - 1];
    if (!last) return;
    const question = lassoInput.trim();
    setLassoInput("");
    setSelection(null);
    setLasso(false);
    const marker = `\n\n`;
    setChat((c) =>
      c
        ? {
            ...c,
            entries: c.entries.map((e) =>
              e.id === last.id ? { ...e, answer: e.answer + marker } : e,
            ),
          }
        : c,
    );
    animating.current = true;
    void stream(
      { mode: "lasso", question, selection: selection.text, context: last.answer },
      (chunk) =>
        setChat((c) =>
          c
            ? {
                ...c,
                entries: c.entries.map((e) =>
                  e.id === last.id ? { ...e, answer: e.answer + chunk } : e,
                ),
              }
            : c,
        ),
      () =>
        setChat((c) => {
          if (c) persist(c);
          setChats(loadChats());
          return c;
        }),
    );
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  };

  const page = pages[pageIndex];

  return (
    <div className="desk-bg flex h-[100dvh] w-full flex-col overflow-hidden">
      {/* notebook */}
      <div className="min-h-0 flex-1 px-2 pt-3 pb-1 sm:px-6 sm:pt-6">
        <div
          className="relative mx-auto h-full w-full max-w-3xl rounded-xl bg-paper-edge p-1.5 shadow-[var(--shadow-book)]"
          style={{ backgroundImage: "linear-gradient(90deg, oklch(0.55 0.05 250) 0 18px, transparent 18px)" }}
        >
          <div ref={pageRef} className="relative h-full w-full">
            <NotebookPage
              page={page}
              reveal={reveal}
              pageNumber={pageIndex + 1}
              linesPerPage={dims.linesPerPage}
            />
            <LassoLayer active={lasso} onSelect={setSelection} />

            {selection && (
              <div
                className="absolute z-30 w-60 rounded-lg border border-ink-marker/40 bg-paper p-2 shadow-lg"
                style={{
                  left: Math.min(Math.max(4, selection.rect.left), (pageRef.current?.clientWidth ?? 300) - 250),
                  top: Math.min(
                    selection.rect.top + selection.rect.height + 6,
                    (pageRef.current?.clientHeight ?? 300) - 110,
                  ),
                }}
              >
                <p className="mb-1 line-clamp-2 font-[family-name:var(--font-hand)] text-sm text-ink/70">
                  “{selection.text.slice(0, 70)}”
                </p>
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={lassoInput}
                    onChange={(e) => setLassoInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && askLasso()}
                    placeholder="What about this?"
                    className="min-w-0 flex-1 rounded border border-ink/20 bg-transparent px-2 py-1 text-sm text-ink outline-none placeholder:text-ink/40"
                  />
                  <button
                    onClick={askLasso}
                    className="rounded bg-ink-marker px-2 text-paper"
                    aria-label="Ask about selection"
                  >
                    <Send className="size-4" />
                  </button>
                  <button
                    onClick={() => setSelection(null)}
                    className="rounded px-1 text-ink/50"
                    aria-label="Cancel"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )}

            {pages.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center">
                <p className="font-[family-name:var(--font-hand)] text-2xl text-ink/45">
                  Ask a doubt below and I'll write the answer here, step by step.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* desk strip: menu, pen, page flip, ask box */}
      <div className="shrink-0 px-2 pb-3 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {error && <p className="text-center text-xs text-ink-red/90">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              className="glass grid size-10 place-items-center rounded-xl text-paper/90"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="glass flex items-center gap-1 rounded-xl px-1 py-1 text-paper/90">
              <button
                onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                disabled={pageIndex === 0}
                className="grid size-8 place-items-center rounded-lg disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-5" />
              </button>
              <span className="min-w-12 text-center font-[family-name:var(--font-hand)] text-sm">
                {Math.min(pageIndex + 1, Math.max(1, pages.length))}/{Math.max(1, pages.length)}
              </span>
              <button
                onClick={() => {
                  animating.current = false;
                  setPageIndex((i) => Math.min(pages.length - 1, i + 1));
                }}
                disabled={pageIndex >= pages.length - 1}
                className="grid size-8 place-items-center rounded-lg disabled:opacity-30"
                aria-label="Next page"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
            <div className="flex-1" />
            <div className="glass flex rounded-xl p-1 text-xs text-paper/90">
              {(["solve", "notes"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-3 py-1.5 capitalize ${mode === m ? "bg-paper/85 text-desk-2 font-semibold" : ""}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setLasso((v) => !v);
                setSelection(null);
              }}
              className={`grid size-10 place-items-center rounded-xl ${lasso ? "bg-ink-marker text-paper" : "glass text-paper/90"}`}
              aria-label="Lasso select"
              title="Circle something on the page to ask about it"
            >
              <Pencil className="size-5" />
            </button>
          </div>

          <div className="glass flex items-end gap-2 rounded-2xl p-2">
            <label className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-paper/80 hover:bg-paper/10">
              <ImagePlus className="size-5" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            {image && (
              <img
                src={image}
                alt="Question photo"
                className="size-9 shrink-0 rounded-md object-cover"
              />
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
              rows={1}
              placeholder={mode === "notes" ? "Topic for notes…" : "Ask your next doubt…"}
              className="max-h-24 min-h-9 flex-1 resize-none bg-transparent py-1.5 font-[family-name:var(--font-hand)] text-xl text-paper outline-none placeholder:text-paper/40"
            />
            <button
              onClick={ask}
              disabled={busy}
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper text-desk-2 disabled:opacity-40"
              aria-label="Ask"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-desk-2/60 backdrop-blur-sm" />
          <div
            className="glass relative h-full w-80 max-w-[85vw] overflow-y-auto p-4 text-paper"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="size-5" />
              <h2 className="font-[family-name:var(--font-hand)] text-2xl">My notebooks</h2>
            </div>
            <button
              onClick={() => {
                const id = newId();
                persist({ id, title: "New doubt", createdAt: Date.now(), entries: [] });
                setMenuOpen(false);
                void navigate({ to: "/c/$chatId", params: { chatId: id } });
              }}
              className="mb-4 flex w-full items-center gap-2 rounded-xl bg-paper/90 px-3 py-2 text-desk-2"
            >
              <Plus className="size-4" /> New notebook
            </button>
            <ul className="space-y-1">
              {chats.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-center gap-1 rounded-lg px-1 ${c.id === chatId ? "bg-paper/15" : ""}`}
                >
                  <Link
                    to="/c/$chatId"
                    params={{ chatId: c.id }}
                    onClick={() => setMenuOpen(false)}
                    className="min-w-0 flex-1 truncate py-2 text-sm"
                  >
                    {c.title || "Untitled"}
                  </Link>
                  <button
                    onClick={() => {
                      deleteChat(c.id);
                      setChats(loadChats());
                      if (c.id === chatId) void navigate({ to: "/" });
                    }}
                    className="grid size-8 place-items-center rounded text-paper/60 hover:text-ink-red"
                    aria-label="Delete notebook"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
              {chats.length === 0 && <li className="text-sm text-paper/60">No saved notebooks yet.</li>}
            </ul>
            <p className="mt-6 text-xs text-paper/50">
              Notebooks are saved in this browser only.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
