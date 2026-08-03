import { useCallback, useRef, useState } from "react";

/**
 * Mic dictation: records a self-contained audio clip and sends it to
 * /api/transcribe (Groq Whisper, Gemini fallback).
 */
export function useDictation(onText: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access is needed to speak your doubt.");
      return;
    }
    const mime = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || "audio/webm";
      const blob = new Blob(chunks.current, { type });
      setRecording(false);
      if (blob.size < 1500) {
        setError("That recording was too short — hold the mic and speak.");
        return;
      }
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      void (async () => {
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", blob, `speech.${ext}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
          if (!res.ok || !data.text) {
            setError(data.error ?? "Could not transcribe that. Please try again.");
            return;
          }
          onText(data.text);
        } catch {
          setError("Network problem while transcribing.");
        } finally {
          setTranscribing(false);
        }
      })();
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
  }, [onText]);

  const stop = useCallback(() => {
    recorder.current?.state === "recording" && recorder.current.stop();
  }, []);

  const toggle = useCallback(() => {
    if (recording) stop();
    else void start();
  }, [recording, start, stop]);

  return { recording, transcribing, error, toggle };
}
