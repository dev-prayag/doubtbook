import { useMemo } from "react";
import type { Line, Page } from "@/lib/notebook";
import { InkFigure, InkText } from "./Ink";

const kindClass: Record<string, string> = {
  q: "text-ink font-semibold",
  h: "text-ink-marker font-semibold",
  step: "text-ink-blue",
  important: "text-ink-green font-semibold",
  final: "text-ink-red font-semibold underline decoration-2 decoration-ink-red/60",
  diagram: "text-ink font-[family-name:var(--font-hand-alt)] text-[0.95rem]",
  p: "text-ink-blue",
  gen: "text-ink/45 italic",
  blank: "",
};

function LineRow({ line, reveal }: { line: Line; reveal: number }) {
  if (line.kind === "draw") {
    return (
      <InkFigure svg={line.svg ?? ""} rows={line.rows ?? 6} visible={reveal >= line.offset} />
    );
  }

  const shown = Math.max(0, Math.min(line.text.length, reveal - line.offset));
  if (shown <= 0 && line.kind !== "blank" && line.kind !== "gen") return <div className="hand-line" />;
  const writing = shown < line.text.length;

  if (line.kind === "gen") {
    return (
      <div className="hand-line text-ink/45 italic">
        <span>{line.text}</span>
        <span className="gen-dots" />
      </div>
    );
  }

  const prefix =
    !line.first || line.kind === "blank"
      ? ""
      : line.kind === "q"
        ? `Q${line.qNumber ?? 1}. `
        : line.kind === "important"
          ? "★ "
          : line.kind === "final"
            ? "Ans. "
            : line.kind === "step"
              ? "• "
              : "";

  return (
    <div
      data-line
      className={`hand-line ${kindClass[line.kind] ?? ""} ${line.kind === "h" ? "text-[1.35rem]" : ""}`}
      style={{ paddingLeft: line.kind === "q" ? 0 : line.kind === "diagram" ? "0.2rem" : "0.6rem" }}
    >
      <span className={writing ? "caret" : ""}>
        {prefix}
        <InkText text={line.text} shown={shown} />
      </span>
    </div>
  );
}

export function NotebookPage({
  page,
  reveal,
  pageNumber,
  linesPerPage,
}: {
  page: Page | undefined;
  reveal: number;
  pageNumber: number;
  linesPerPage: number;
}) {
  const filler = useMemo(
    () => Array.from({ length: Math.max(0, linesPerPage - (page?.lines.length ?? 0)) }),
    [linesPerPage, page],
  );

  return (
    <div className="paper paper-margin relative h-full w-full overflow-hidden rounded-r-xl rounded-l-sm px-3 pl-14 shadow-[inset_18px_0_28px_-24px_oklch(0_0_0/45%)]">
      {page?.lines.map((line, i) => <LineRow key={i} line={line} reveal={reveal} />)}

      <span className="absolute right-4 bottom-1 font-[family-name:var(--font-hand)] text-sm text-ink/45">
        {pageNumber}
      </span>
    </div>
  );
}
