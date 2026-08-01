import { Check, Loader2, X } from "lucide-react";
import type { Ocr } from "@/lib/notebook";
import { InkText } from "./Ink";

/**
 * Shows what was read from an uploaded photo before solving: the transcription
 * with the detected questions highlighted, plus the extracted question list.
 */
export function OcrPanel({
  image,
  ocr,
  loading,
  onSolve,
  onCancel,
}: {
  image: string;
  ocr: Ocr | null;
  loading: boolean;
  onSolve: () => void;
  onCancel: () => void;
}) {
  const questions = ocr?.questions ?? [];
  const lines = (ocr?.raw ?? "").split("\n");
  const isQuestionLine = (line: string) => {
    const l = line.trim().toLowerCase();
    if (l.length < 4) return false;
    if (/^(q\s*\.?\s*)?\d+\s*[.)]/.test(l)) return true;
    return questions.some((q) => {
      const head = q.toLowerCase().slice(0, 24);
      return head.length > 6 && l.includes(head);
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-desk-2/70 p-0 backdrop-blur-md sm:items-center sm:p-6">
      <div className="glass relative flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-none text-paper sm:h-[85vh] sm:rounded-3xl">
        <header className="flex items-center gap-2 border-b border-paper/15 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-[family-name:var(--font-hand)] text-2xl leading-none">
              What I read from your photo
            </p>
            <p className="mt-1 text-xs text-paper/60">
              {loading
                ? "Reading the page…"
                : `${questions.length} question${questions.length === 1 ? "" : "s"} detected — check before solving.`}
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close photo reader"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-paper/10 hover:bg-paper/20"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <img
            src={image}
            alt="Uploaded question page"
            className="max-h-56 w-full rounded-xl object-contain"
          />

          {loading && (
            <p className="flex items-center gap-2 text-sm text-paper/70">
              <Loader2 className="size-4 animate-spin" /> extracting the text…
            </p>
          )}

          {!loading && questions.length > 0 && (
            <div>
              <p className="mb-1 text-xs tracking-wide text-paper/50 uppercase">
                Detected questions
              </p>
              <ol className="space-y-1.5">
                {questions.map((q, i) => (
                  <li
                    key={i}
                    className="rounded-lg bg-paper/12 px-3 py-2 text-sm leading-relaxed text-paper"
                  >
                    <span className="mr-1 font-semibold text-ink-marker">Q{i + 1}.</span>
                    <InkText text={q} />
                  </li>
                ))}
              </ol>
            </div>
          )}

          {!loading && lines.length > 0 && (
            <div>
              <p className="mb-1 text-xs tracking-wide text-paper/50 uppercase">
                Extracted text (highlighted = question)
              </p>
              <div className="rounded-xl bg-desk-2/40 p-3 text-sm leading-relaxed">
                {lines.map((line, i) => (
                  <p
                    key={i}
                    className={
                      isQuestionLine(line)
                        ? "-mx-1 my-0.5 rounded bg-ink-marker/30 px-1 font-medium text-paper"
                        : "text-paper/70"
                    }
                  >
                    <InkText text={line || " "} />
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-paper/15 p-3">
          <button
            onClick={onCancel}
            className="rounded-xl bg-paper/10 px-4 py-2 text-sm text-paper/80"
          >
            Cancel
          </button>
          <div className="flex-1" />
          <button
            onClick={onSolve}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-paper px-4 py-2 text-sm font-semibold text-desk-2 disabled:opacity-40"
          >
            <Check className="size-4" /> Solve in notebook
          </button>
        </div>
      </div>
    </div>
  );
}
