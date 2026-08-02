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
          system: `You read photos of school worksheets, textbook pages and handwritten notes.
Transcribe the page, then list every question printed on it.
Write mathematics as inline LaTeX inside single dollar signs, e.g. $\\sqrt{5}$,
$\\frac{a+b}{2}$ — never ASCII math like sqrt() or x^2.
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
                { type: "text", text: "Transcribe this page and list its questions." },
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
          .filter((l) => l.length > 1);

        return Response.json({ raw: rawText.trim(), questions });
      },
    },
  },
});
