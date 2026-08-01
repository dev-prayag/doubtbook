/** Notebook -> PDF export (each notebook page becomes one PDF page). */
export async function capturePage(el: HTMLElement): Promise<string> {
  el.classList.add("pdf-export");
  try {
    return await snapshot(el);
  } finally {
    el.classList.remove("pdf-export");
  }
}

async function snapshot(el: HTMLElement): Promise<string> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(el, {
    backgroundColor: "#fbf8ee",
    scale: 2,
    useCORS: true,
    logging: false,
    ignoreElements: (node: Element) => node.hasAttribute?.("data-export-ignore"),
  });
  return canvas.toDataURL("image/jpeg", 0.92);
}

export async function buildPdf(images: string[], title: string) {
  const { jsPDF } = await import("jspdf");
  if (!images.length) return;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 24;

  images.forEach((img, i) => {
    if (i > 0) doc.addPage();
    const props = doc.getImageProperties(img);
    const maxW = pw - margin * 2;
    const maxH = ph - margin * 2;
    const scale = Math.min(maxW / props.width, maxH / props.height);
    const w = props.width * scale;
    const h = props.height * scale;
    doc.addImage(img, "JPEG", (pw - w) / 2, (ph - h) / 2, w, h);
  });

  const safe = (title || "notebook").replace(/[^\w\- ]+/g, "").trim() || "notebook";
  doc.save(`${safe}.pdf`);
}

export function nextFrame(ms = 260) {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, ms));
  });
}
