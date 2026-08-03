import { createFileRoute } from "@tanstack/react-router";

/**
 * Speech-to-text for the mic button.
 * Uses the student's own Groq key (Whisper large v3 turbo — free tier),
 * falling back to Google's Gemini audio understanding if Groq fails.
 */
async function viaGroq(file: File) {
  const key = process.env["GROQ_API_KEY"];
  if (!key) return null;
  const form = new FormData();
  form.append("model", "whisper-large-v3-turbo");
  form.append("file", file, file.name || "speech.webm");
  form.append("response_format", "json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    console.error("groq transcription failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

async function viaGemini(file: File) {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return null;
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of buf) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: "Transcribe this student's spoken doubt exactly. Return only the words." },
              { inlineData: { mimeType: file.type || "audio/webm", data: base64 } },
            ],
          },
        ],
      }),
    },
  );
  if (!res.ok) {
    console.error("gemini transcription failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null);
        const file = form?.get("audio");
        if (!(file instanceof File) || file.size < 1200)
          return new Response(JSON.stringify({ error: "That recording was empty — try again." }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        if (file.size > 20 * 1024 * 1024)
          return new Response(JSON.stringify({ error: "Recording is too long." }), {
            status: 413,
            headers: { "content-type": "application/json" },
          });

        try {
          const text = (await viaGroq(file)) ?? (await viaGemini(file));
          if (text === null || text === undefined)
            return new Response(JSON.stringify({ error: "Could not transcribe that." }), {
              status: 502,
              headers: { "content-type": "application/json" },
            });
          return new Response(JSON.stringify({ text }), {
            headers: { "content-type": "application/json" },
          });
        } catch (error) {
          console.error("transcription error", error);
          return new Response(JSON.stringify({ error: "Could not transcribe that." }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
