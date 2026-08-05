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

  /** even-odd point-in-polygon test on the drawn lasso path */
  const inside = (pts: Array<[number, number]>, x: number, y: number) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]!;
      const [xj, yj] = pts[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
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
    const tiny = rect.width < 24 && rect.height < 24; // a tap, not a loop
    const picked = lines.filter((el) => {
      if (!el.innerText.trim()) return false;
      const r = el.getBoundingClientRect();
      const top = r.top - box.top;
      const height = r.height;
      const left = r.left - box.left;
      const width = r.width;
      const mid = top + height / 2;
      if (tiny) return mid > rect.top - height && mid < rect.top + rect.height + height;
      // sample points across the line's own row: a line counts as selected when
      // a real part of it falls inside the drawn loop
      let hits = 0;
      const samples = 9;
      for (let i = 0; i < samples; i += 1) {
        const x = left + (width * (i + 0.5)) / samples;
        if (inside(pts, x, mid) || inside(pts, x, top + height * 0.3)) hits += 1;
      }
      if (hits >= 2) return true;
      // fall back to vertical band overlap for quick sloppy scribbles
      const overlap =
        Math.min(top + height, rect.top + rect.height) - Math.max(top, rect.top);
      return overlap > height * 0.5;
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
