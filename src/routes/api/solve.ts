import { createFileRoute } from "@tanstack/react-router";
import { hasAnyKey, streamWithFallback } from "@/lib/ai-providers.server";

type Body = {
  mode?: "solve" | "notes" | "lasso";
  question?: string;
  imageDataUrl?: string;
  selection?: string;
  context?: string;
  ocrQuestions?: string[];
};

const FORMAT = `You write inside a student's ruled paper notebook, by hand.
Output PLAIN TEXT lines only. Never use markdown (**, ##, backticks, | tables).
Start each line with one of these ink markers (marker + one space):
"? " a question that is about to be answered
"# " section heading, written in marker pen
"> " a working step of the solution
"! " an important point / rule / caution
"= " the final answer
no marker = ordinary explanation line
Leave a truly blank line between blocks. Never explain these markers.

MATHEMATICS — always LaTeX, never ASCII math:
Wrap every mathematical expression, symbol, number with units, variable or
equation in single dollar signs, e.g. $\\sqrt{5}$, $\\frac{a+b}{2}$, $x^{2}$,
$\\int_0^1 x\\,dx$, $\\theta = 30^\\circ$.
NEVER write sqrt(...), x^2, a/b, +-, <=, or any plain-text math outside $...$.
Never use $$ ... $$, \\[ \\], \\begin{align} or display math — inline $...$ only.
Use the full width of the line: keep writing on the same line until it is
genuinely full, and only then continue on the next one. Never break a line
early, and never put a single short fragment on a line of its own.
Split a derivation across lines only when it truly does not fit.

DRAWINGS, GRAPHS AND TABLES — always real SVG, never ASCII art:
Never draw with -, |, +, _ characters. Instead emit a figure block exactly:
[draw rows=10]
<svg viewBox="0 0 900 400" width="100%" height="100%">...</svg>
[/draw]
rows = how many notebook lines tall the figure should be (4 to 14). Be
generous: tables, graphs and diagrams should be BIG and easy to read —
use 8 to 14 rows for anything with several columns or data points.
Use viewBox="0 0 900 H" where H = rows*40, and make the drawing fill it
edge to edge (font-size 20-26 for table text and axis labels).
Draw with real geometry: <line>, <rect>, <circle>, <path>, <polyline>, <text>.
Use stroke="#2b4a8b" for construction lines, stroke="#b23a2f" for highlights,
fill="none" where appropriate, and font-family="Patrick Hand, cursive"
font-size="16" fill="#2f3542" for labels. For tables draw the grid with
<line> rules and place cell text with <text>. Use figures generously for
tables, graphs, number lines, geometry, circuits and flow charts.

You have full freedom in how you lay out figures and drawings — draw whatever
serves the explanation best (graphs, number lines, geometry, circuits, flow
charts, big tables). Do not compromise on figure size or detail.
Write in full, complete lines rather than many short broken ones.`;

export const Route = createFileRoute("/api/solve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        if (!hasAnyKey())
          return new Response("Missing GEMINI_API_KEY / GROQ_API_KEY", { status: 500 });

        const mode = body.mode ?? "solve";
        let system = FORMAT;
        if (mode === "notes") {
          system += `

You are a topper making beautiful colourful class notes on this topic.
NEVER output a "? " question line in notes mode — no question numbers at all.
Start straight away with a "# " topic heading, then short definition lines,
"! " for key points and formulae, figures for diagrams/tables, and a final
"= " one-line summary. Be organised and generous with headings.`;
        } else if (mode === "lasso") {
          system = `You are a friendly tutor answering one focused doubt in a chat bubble.
Reply in short plain paragraphs and short "- " bullet lines. No markdown
headings, no bold, no backticks. Write ALL mathematics as inline LaTeX in
single dollar signs, e.g. $\\frac{a}{b}$, $\\sqrt{2}$, $x^{2}$ — never ASCII
math like sqrt() or x^2. Keep it under 180 words unless asked for more.`;
        } else {
          system += `

You are a patient tutor solving the student's question step by step.
FIRST clean up the question:
- The student may have rambled or dictated a long paragraph. Rewrite it as one
  short, clear, faithful question and output it as a single "? " line.
- If the question is already short and clear, keep it almost as it is.
- If an image is attached (a worksheet or textbook page), READ the actual
  questions printed in it. Output one "? " line per printed question using the
  question's own wording (shortened if very long), and solve each question
  right after its own "? " line. Never invent a question like
  "solve this photo" — always use the real questions from the page.
Then for each question, ANSWER FIRST, EXPLAIN AFTER:
1. Immediately after the "? " line, give the final answer on an "= " line.
2. Then a "# Explanation" heading.
3. Then restate what is given, work "> " step by step showing every
   calculation, and add "! " for the rule used.
Never keep the answer for the end — the "= " answer line always comes
before any working or explanation for that question.`;
        }

        const parts: Array<Record<string, unknown>> = [];
        let text = "";
        if (mode === "lasso") {
          text += `The student circled this part of the notebook page:\n"""${body.selection ?? ""}"""\n\nTheir doubt: ${body.question ?? "Explain this."}`;
          if (body.context) text += `\n\nEarlier on this page:\n"""${body.context.slice(-2500)}"""`;
        } else {
          text += body.question?.trim() || "Solve the questions in the attached photo.";
          if (body.ocrQuestions?.length) {
            text += `\n\nQuestions detected in the photo (solve each of these):\n${body.ocrQuestions
              .map((q, i) => `${i + 1}. ${q}`)
              .join("\n")}`;
          }
          if (body.context) text += `\n\n(Earlier in this notebook:\n${body.context.slice(-1500)})`;
        }
        parts.push({ type: "text", text });
        if (body.imageDataUrl) {
          parts.push({ type: "image", image: body.imageDataUrl });
        }

        return streamWithFallback({
          system,
          messages: [{ role: "user", content: parts as never }],
          vision: !!body.imageDataUrl,
        });
      },
    },
  },
});
