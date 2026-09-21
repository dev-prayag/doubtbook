import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { InkText } from "./Ink";
import { FluidButton, SpringSheet } from "@/components/ui/fluid";

export type DoubtMessage = { role: "you" | "ai"; text: string };

/**
 * Full-screen chat overlay for a lassoed doubt. Nothing is written into the
 * notebook — the doubt is cleared here and the overlay is closed with X.
 */
export function DoubtOverlay({
  selection,
  messages,
  busy,
  error,
  onAsk,
  onClose,
}: {
  selection: string;
  messages: DoubtMessage[];
  busy: boolean;
  error: string | null;
  onAsk: (question: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = () => {
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    onAsk(q);
  };

  return (
    <div className="glass-backdrop fixed inset-0 z-[60] flex items-stretch justify-center bg-desk-2/70 p-0 backdrop-blur-md sm:items-center sm:p-6">
      <SpringSheet side="center" className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-none text-paper sm:h-[85vh] sm:rounded-3xl">
        <header className="flex items-start gap-2 border-b border-paper/15 p-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-paper/70" />
          <div className="min-w-0 flex-1">
            <p className="font-[family-name:var(--font-hand)] text-2xl leading-none">Doubt cleared</p>
            <p className="mt-1 line-clamp-2 text-xs text-paper/60">
              circled: “{selection.slice(0, 120)}”
            </p>
          </div>
          <FluidButton
            onClick={onClose}
            aria-label="Close doubt chat"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-paper/10 hover:bg-paper/20"
          >
            <X className="size-4" />
          </FluidButton>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "you" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "you"
                    ? "rounded-br-md bg-paper text-desk-2"
                    : "rounded-bl-md bg-paper/12 text-paper"
                }`}
              >
                <InkText text={m.text} />
                {m.role === "ai" && !m.text && busy && (
                  <span className="text-paper/60">
                    thinking<span className="gen-dots" />
                  </span>
                )}
              </div>
            </div>
          ))}
          {error && <p className="text-center text-xs text-ink-red">{error}</p>}
          <div ref={endRef} />
        </div>

        <div className="flex items-end gap-2 border-t border-paper/15 p-3">
          <textarea
            autoFocus
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask another follow-up…"
            className="max-h-28 min-h-9 flex-1 resize-none rounded-xl bg-paper/10 px-3 py-2 text-sm text-paper outline-none placeholder:text-paper/40"
          />
          <FluidButton
            onClick={send}
            disabled={busy}
            aria-label="Send doubt"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-desk-2 disabled:opacity-40"
          >
            <Send className="size-4" />
          </FluidButton>
        </div>
      </SpringSheet>
    </div>
  );
}
