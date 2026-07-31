import { useMemo } from "react";
import type { Line, Page } from "@/lib/notebook";

const kindClass: Record<string, string> = {
  q: "text-ink font-semibold",
  h: "text-ink-marker font-semibold",
  step: "text-ink-blue",
  important: "text-ink-green font-semibold",
  final: "text-ink-red font-semibold underline decoration-2 decoration-ink-red/60",
  diagram: "text-ink font-[family-name:var(--font-hand-alt)] text-[1.05rem]",
  p: "text-ink-blue",
  blank: "",
};

function LineRow({ line, reveal, qNumber }: { line: Line; reveal: number; qNumber: number }) {
  const shown = Math.max(0, Math.min(line.text.length, reveal - line.offset));
  if (shown <= 0 && line.kind !== "blank") return <div className="hand-line" />;
  const text = line.text.slice(0, shown);
  const writing = shown < line.text.length;
  const prefix =
    !line.first || line.kind === "blank"
      ? ""
      : line.kind === "q"
        ? `Q${qNumber}. `
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
      className={`hand-line ${kindClass[line.kind] ?? ""} ${line.kind === "h" ? "text-[1.6rem]" : ""}`}
      style={{ paddingLeft: line.kind === "q" ? 0 : line.kind === "diagram" ? "0.2rem" : "0.6rem" }}
    >
      <span className={writing ? "caret" : ""}>
        {prefix}
        {text}
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
      {page?.lines.map((line, i) => (
        <LineRow key={i} line={line} reveal={reveal} qNumber={page.qNumber} />
      ))}
      {filler.map((_, i) => (
        <div key={`f${i}`} className="hand-line" />
      ))}
      <span className="absolute right-4 bottom-1 font-[family-name:var(--font-hand)] text-sm text-ink/45">
        {pageNumber}
      </span>
    </div>
  );
}
