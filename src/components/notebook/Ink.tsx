import katex from "katex";
import "katex/dist/katex.min.css";
import { segments } from "@/lib/notebook";

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
  const clean = svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    // KaTeX cannot run inside SVG, so render label maths as Unicode instead
    .replace(/(<(?:text|tspan)\b[^>]*>)([\s\S]*?)(<\/(?:text|tspan)>)/gi, (_m, open, body, close) =>
      /<[a-z]/i.test(String(body))
        ? `${open}${body}${close}`
        : `${open}${mathToUnicode(String(body))}${close}`,
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
