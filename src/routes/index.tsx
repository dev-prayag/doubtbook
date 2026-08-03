import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ImagePlus, Loader2, Mic, Send, Sparkles, Square } from "lucide-react";
import { useDictation } from "@/hooks/use-dictation";
import { newId, saveChat, type Chat, type Entry } from "@/lib/notebook";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Doubtbook — AI that solves doubts in a notebook" },
      {
        name: "description",
        content:
          "Type or photograph any question and watch the AI write the full step-by-step solution by hand on ruled notebook pages. Circle anything to ask more.",
      },
      { property: "og:title", content: "Doubtbook — AI that solves doubts in a notebook" },
      {
        property: "og:description",
        content: "Handwritten, step-by-step AI solutions and colourful topper-style notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [mode, setMode] = useState<"solve" | "notes">("solve");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const start = () => {
    if (!question.trim() && !image) return;
    const entry: Entry = {
      id: newId(),
      question: question.trim() || "Solve the question in this photo.",
      imageDataUrl: image,
      mode,
      answer: "",
    };
    const chat: Chat = {
      id: newId(),
      title: entry.question.slice(0, 60),
      createdAt: Date.now(),
      entries: [entry],
    };
    try {
      saveChat(chat);
    } catch {
      saveChat({ ...chat, entries: [{ ...entry, imageDataUrl: undefined }] });
    }
    void navigate({ to: "/c/$chatId", params: { chatId: chat.id } });
  };


  return (
    <main className="desk-bg flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl text-center">
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-paper/20 px-3 py-1 text-xs text-paper/70">
          <Sparkles className="size-3.5" /> written by hand, step by step
        </p>
        <h1 className="font-[family-name:var(--font-hand)] text-5xl leading-tight text-paper sm:text-6xl">
          Doubtbook
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-paper/70">
          Ask a doubt or upload a photo of the question. The AI fills a ruled notebook page with the
          full solution — then circle anything you didn't get.
        </p>

        <div className="glass mt-8 rounded-2xl p-3 text-left">
          <div className="mb-2 flex rounded-xl bg-paper/10 p-1 text-xs text-paper/80">
            {(["solve", "notes"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg px-3 py-1.5 capitalize ${mode === m ? "bg-paper/90 font-semibold text-desk-2" : ""}`}
              >
                {m === "solve" ? "Solve a doubt" : "Make notes"}
              </button>
            ))}
          </div>
          <textarea
            ref={inputRef}
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                start();
              }
            }}
            rows={3}
            placeholder={
              mode === "notes"
                ? "e.g. Notes on laws of motion for class 9"
                : "e.g. If x + a = x + b, what is a + b?"
            }
            className="w-full resize-none bg-transparent p-2 font-[family-name:var(--font-hand)] text-2xl text-paper outline-none placeholder:text-paper/40"
          />
          <div className="mt-1 flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-paper/80 hover:bg-paper/10">
              <ImagePlus className="size-4" />
              {image ? "Photo added" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setImage(String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {image && (
              <img src={image} alt="Question photo" className="size-9 rounded-md object-cover" />
            )}
            <div className="flex-1" />
            <button
              onClick={start}
              className="inline-flex items-center gap-2 rounded-xl bg-paper px-4 py-2 text-sm font-semibold text-desk-2"
            >
              Open notebook <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
