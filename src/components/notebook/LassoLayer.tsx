import { useRef, useState } from "react";

export type LassoSelection = {
  text: string;
  rect: { left: number; top: number; width: number; height: number };
};

export function LassoLayer({
  active,
  onSelect,
}: {
  active: boolean;
  onSelect: (sel: LassoSelection | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<Array<[number, number]>>([]);
  const drawing = useRef(false);

  if (!active) return null;

  const pos = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top] as [number, number];
  };

  const finish = () => {
    drawing.current = false;
    const pts = points;
    setPoints([]);
    if (pts.length < 4) return onSelect(null);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const box = ref.current!.getBoundingClientRect();
    const rect = {
      left: Math.min(...xs),
      top: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    const lines = Array.from(
      ref.current!.parentElement?.querySelectorAll<HTMLElement>("[data-line]") ?? [],
    );
    const picked = lines.filter((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top - box.top;
      const bottom = r.bottom - box.top;
      return bottom > rect.top + 4 && top < rect.top + rect.height - 4 && el.innerText.trim();
    });
    const text = picked
      .map((el) => el.innerText.trim())
      .filter(Boolean)
      .join("\n");
    if (!text) return onSelect(null);
    onSelect({ text, rect });
  };

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-20 cursor-crosshair touch-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        setPoints([pos(e)]);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        setPoints((p) => [...p, pos(e)]);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <svg className="h-full w-full">
        {points.length > 1 && (
          <polyline
            points={points.map((p) => p.join(",")).join(" ")}
            fill="oklch(0.6 0.18 45 / 12%)"
            stroke="oklch(0.6 0.18 45)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeDasharray="7 5"
          />
        )}
      </svg>
    </div>
  );
}
