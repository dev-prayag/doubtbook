import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText } from "ai";
import type { LanguageModel } from "ai";

/**
 * The app runs on the user's own API keys.
 * Gemini is tried first; if that request fails (quota, region, outage) the
 * same request is retried once on Groq — per request, nothing global.
 */

type Candidate = { label: string; model: LanguageModel };

function gemini(vision: boolean): Candidate | null {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return null;
  const provider = createOpenAICompatible({
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    headers: { Authorization: `Bearer ${key}` },
    queryParams: { key },
  });
  return {
    label: "gemini",
    model: provider(vision ? "gemini-2.5-flash" : "gemini-2.5-flash"),
  };
}

function groq(vision: boolean): Candidate | null {
  const key = process.env["GROQ_API_KEY"];
  if (!key) return null;
  const provider = createOpenAICompatible({
    name: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    headers: { Authorization: `Bearer ${key}` },
  });
  return {
    label: "groq",
    model: provider(
      vision ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
    ),
  };
}

function huggingface(vision: boolean): Candidate | null {
  const key = process.env["HUGGINGFACE_API_KEY"];
  if (!key) return null;
  const provider = createOpenAICompatible({
    name: "huggingface",
    baseURL: "https://router.huggingface.co/v1",
    headers: { Authorization: `Bearer ${key}` },
  });
  return {
    label: "huggingface",
    model: provider(
      vision ? "Qwen/Qwen2.5-VL-7B-Instruct" : "meta-llama/Llama-3.3-70B-Instruct",
    ),
  };
}

/**
 * Gemini leads for anything with a photo (it reads pages far better);
 * Groq leads for plain text solving/notes (fast), with Gemini right behind.
 */
function candidates(vision: boolean): Candidate[] {
  const list = vision
    ? [gemini(vision), groq(vision), huggingface(vision)]
    : [groq(vision), gemini(vision), huggingface(vision)];
  return list.filter(Boolean) as Candidate[];
}

export function hasAnyKey() {
  return candidates(false).length > 0;
}

type Args = {
  system: string;
  messages: NonNullable<Parameters<typeof streamText>[0]["messages"]>;
  vision?: boolean;
};

/** Streams text, transparently falling back to Groq if Gemini fails. */
export async function streamWithFallback({ system, messages, vision }: Args): Promise<Response> {
  const list = candidates(!!vision);
  let lastError: unknown;

  for (const candidate of list) {
    try {
      const result = streamText({ model: candidate.model, system, messages });
      const iterator = result.textStream[Symbol.asyncIterator]();
      const first = await iterator.next(); // surfaces auth/quota errors here
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            if (!first.done) controller.enqueue(encoder.encode(first.value));
            while (true) {
              const next = await iterator.next();
              if (next.done) break;
              controller.enqueue(encoder.encode(next.value));
            }
            controller.close();
          } catch (error) {
            console.error(`stream failed mid-response on ${candidate.label}`, error);
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-ai-provider": candidate.label,
        },
      });
    } catch (error) {
      lastError = error;
      console.error(`${candidate.label} failed, trying next provider`, error);
    }
  }

  console.error("all providers failed", lastError);
  return new Response("All AI providers failed", { status: 502 });
}

/** One-shot generation with the same Gemini -> Groq fallback. */
export async function generateWithFallback({ system, messages, vision }: Args) {
  let lastError: unknown;
  for (const candidate of candidates(!!vision)) {
    try {
      const { text } = await generateText({ model: candidate.model, system, messages });
      return { text, provider: candidate.label };
    } catch (error) {
      lastError = error;
      console.error(`${candidate.label} failed, trying next provider`, error);
    }
  }
  throw lastError ?? new Error("No AI provider configured");
}
