import katex from "katex";
import "katex/dist/katex.min.css";
import { mathToUnicode, segments } from "@/lib/notebook";

function html(tex: string) {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode: false, output: "html" });
  } catch {
    return tex;
  }
}

/**
 * Renders a notebook line: plain handwriting for text, KaTeX for $...$ spans.
 * `shown` is the number of characters revealed by the writing animation
 * (Infinity for a finished line). Math spans appear atomically.
 */
export function InkText({ text, shown = Infinity }: { text: string; shown?: number }) {
  const parts = segments(text);
  const out: React.ReactNode[] = [];
  let cursor = 0;

  parts.forEach((seg, i) => {
    const raw = seg.math ? `$${seg.value}$` : seg.value;
    const start = cursor;
    cursor += raw.length;
    if (start >= shown) return;
    if (seg.math) {
      if (shown < cursor) return;
      out.push(
        <span
          key={i}
          className="ink-math"
          dangerouslySetInnerHTML={{ __html: html(seg.value) }}
        />,
      );
    } else {
      out.push(<span key={i}>{seg.value.slice(0, Math.max(0, shown - start))}</span>);
    }
  });

  return <>{out}</>;
}

/** LaTeX -> Unicode inside every label-bearing SVG node (nested tspans included). */
function convertSvgLabels(src: string): string {
  const LABEL_TAGS = "text|tspan|title|desc|textPath";
  let s = src;
  // innermost-first: bodies without nested tags get converted, repeat for nesting
  for (let pass = 0; pass < 4; pass += 1) {
    s = s.replace(
      new RegExp(`(<(${LABEL_TAGS})\\b[^>]*>)([^<]*)(</\\2>)`, "gi"),
      (_m, open: string, _tag: string, body: string, close: string) =>
        body.trim() ? `${open}${mathToUnicode(body)}${close}` : `${open}${body}${close}`,
    );
  }
  // labels passed as attributes (aria-label, data-label, alt)
  s = s.replace(
    /\b(aria-label|data-label|alt)\s*=\s*"([^"]*)"/gi,
    (_m, name: string, value: string) => `${name}="${mathToUnicode(value)}"`,
  );
  return s;
}

/** Sanitised inline SVG figure (tables, graphs, drawings drawn by the AI). */
export function InkFigure({
  svg,
  rows,
  visible,
}: {
  svg: string;
  rows: number;
  visible: boolean;
}) {
  const clean = convertSvgLabels(
    svg
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, ""),
  );

  return (
    <div
      className="ink-figure"
      style={{
        height: `calc(var(--rule) * ${rows})`,
        opacity: visible ? 1 : 0,
        transition: "opacity 320ms ease",
      }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

