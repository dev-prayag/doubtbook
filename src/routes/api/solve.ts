import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type Body = {
  mode?: "solve" | "notes" | "lasso";
  question?: string;
  imageDataUrl?: string;
  selection?: string;
  context?: string;
};

const FORMAT = `You write inside a student's ruled paper notebook, by hand.
Output PLAIN TEXT lines only. Never use markdown (**, ##, backticks) or LaTeX ($, \\frac).
Write math in plain readable form: (a + b)/2, x^2, sqrt(5), 3/4.
Keep every line SHORT (under 58 characters) and break work across many lines.
Start each line with one of these ink markers (marker + one space):
"# " section heading, written in marker pen
"> " a working step of the solution
"! " an important point / rule / caution
"= " the final answer
"~ " a line of a simple ASCII diagram or table
no marker = ordinary explanation line
Leave a truly blank line between blocks. Never explain these markers.`;

export const Route = createFileRoute("/api/solve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const mode = body.mode ?? "solve";
        let system = FORMAT;
        if (mode === "notes") {
          system += `
You are a topper making beautiful colourful class notes.
Structure: "# " topic heading, then short definition lines, then
"! " for key points/formulae, "~ " for a small labelled diagram or table,
and "= " for a one-line summary. Be organised and generous with headings.`;
        } else if (mode === "lasso") {
          system += `
The student circled a part of your own notebook page and asked about it.
Answer ONLY about that circled part. Begin with a "# " heading that starts
with "Doubt:" and stay brief and step-by-step.`;
        } else {
          system += `
You are a patient tutor solving the student's question step by step.
Restate what is given, then work "> " step by step showing every calculation,
add "! " for the rule used, and finish with "= " and the final answer.`;
        }

        const parts: Array<Record<string, unknown>> = [];
        let text = "";
        if (mode === "lasso") {
          text += `Circled from the page:\n"""${body.selection ?? ""}"""\n\nStudent asks: ${body.question ?? "Explain this."}`;
          if (body.context) text += `\n\nEarlier on this page:\n"""${body.context.slice(-2000)}"""`;
        } else {
          text += body.question?.trim() || "Solve the question in the attached photo.";
          if (body.context) text += `\n\n(Earlier in this notebook:\n${body.context.slice(-1500)})`;
        }
        parts.push({ type: "text", text });
        if (body.imageDataUrl) {
          parts.push({ type: "image", image: body.imageDataUrl });
        }

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3.6-flash"),
          system,
          messages: [{ role: "user", content: parts as never }],
        });

        return result.toTextStreamResponse();
      },
    },
  },
});
