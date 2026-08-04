import { createFileRoute } from "@tanstack/react-router";
import { generateWithFallback, hasAnyKey } from "@/lib/ai-providers.server";

type Body = { imageDataUrl?: string };

/** Reads a photo of a worksheet / textbook page and extracts its questions. */
export const Route = createFileRoute("/api/ocr")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        if (!hasAnyKey())
          return new Response("Missing GEMINI_API_KEY / GROQ_API_KEY", { status: 500 });
        if (!body.imageDataUrl) return new Response("No image", { status: 400 });

        const { text } = await generateWithFallback({
          vision: true,
          system: `You are a careful page reader for school worksheets, textbook pages and handwritten notes.
Analyse the WHOLE image: printed text, handwriting, tables, diagrams, graphs, chemical structures,
figure captions and anything written in the margins. Rotate/deskew mentally if the photo is tilted.

Rules:
- Transcribe line by line, keeping the original order and numbering (1., 2., (a), (b), i), ii)).
- Keep table rows readable as "cell | cell | cell".
- For a diagram or graph, add a line starting with "[figure] " describing it and every label/axis value.
- Write ALL mathematics and chemistry as inline LaTeX inside single dollar signs, e.g. $\\sqrt{5}$,
  $\\frac{a+b}{2}$, $x^{2}$, $[\\mathrm{Co(NH_3)_6}]\\mathrm{Cl_3}$ — never ASCII math like sqrt() or x^2.
- In QUESTIONS list only real questions/tasks the page asks (include their sub-parts merged in),
  never instructions like "Answer all questions" or headers like "Chapter 4 Exercise".
- If a question refers to a figure/table, append the needed details so it can be solved standalone.
- Never invent content you cannot see; if a token is unreadable write [?].

Reply in exactly this plain-text shape and nothing else:

TEXT:
<the full transcription of the page, line by line>

QUESTIONS:
1. <first question, exactly as printed but tidied>
2. <second question>
(one numbered line per question; if there is only one question, list one)`,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Read this page carefully and list every question it asks.",
                },
                { type: "image", image: body.imageDataUrl },
              ] as never,
            },
          ],
        });


        const [, rawText = "", rawQs = ""] = /TEXT:\s*([\s\S]*?)\n\s*QUESTIONS:\s*([\s\S]*)$/.exec(
          text,
        ) ?? [undefined, text, ""];

        const questions = rawQs
          .split("\n")
          .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
          .filter((l) => l.length > 1 && !/^\[figure\]/i.test(l));

        return Response.json({ raw: rawText.trim(), questions });
      },
    },
  },
});
