import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { sliceUrl } from "../services/api.js";

const PLANES = [["axial", "Axial"], ["coronal", "Coronal"], ["sagittal", "Sagittal"]];
const REGIONS = [
  { id: 3, name: "Enhancing tumor", color: "#f5c542" },
  { id: 1, name: "Necrotic core", color: "#e5484d" },
  { id: 2, name: "Edema", color: "#3fb68b" },
];
const MAGENTA = "#d946ef";

function Panel({ title, children }) {
  return (
    <figure className="min-w-0">
      <figcaption className="label mb-1.5">{title}</figcaption>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-black">{children}</div>
    </figure>
  );
}
const fill = "absolute inset-0 h-full w-full object-contain select-none";

/** Original / predicted mask / overlay, synchronized. All pixels come from the backend (real model output). */
export default function SliceViewer({ result }) {
  const { id, views } = result;
  const [plane, setPlane] = useState("axial");
  const [index, setIndex] = useState({ ...views.default_slices });
  const [modality, setModality] = useState(0);
  const [opacity, setOpacity] = useState(0.55);
  const [style, setStyle] = useState("single");
  const [labels, setLabels] = useState([1, 2, 3]);

  const total = views.plane_counts[plane];
  const i = index[plane];
  const setI = (v) => setIndex((p) => ({ ...p, [plane]: Math.max(0, Math.min(total - 1, v)) }));

  const urls = useMemo(() => ({
    original: sliceUrl(id, { plane, index: i, view: "original", modality }),
    mask: sliceUrl(id, { plane, index: i, view: "mask", style, labels }),
  }), [id, plane, i, modality, style, labels]);

  const toggle = (rid) => setLabels((l) => (l.includes(rid) ? l.filter((x) => x !== rid) : [...l, rid].sort()));
  const onKey = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setI(i - 1); }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setI(i + 1); }
  };

  return (
    <section className="card p-4 sm:p-5" aria-label="Slice viewer">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="inline-flex rounded-xl bg-navy-100/70 p-1">
          {PLANES.map(([k, name]) => (
            <button key={k} role="tab" aria-selected={plane === k} onClick={() => setPlane(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${plane === k ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-800"}`}>{name}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-navy-600">
          Background scan
          <select value={modality} onChange={(e) => setModality(Number(e.target.value))} className="rounded-lg border border-navy-200 bg-white px-2 py-1.5 text-sm">
            {views.modalities.map((m, k) => <option key={m} value={k}>{m}</option>)}
          </select>
        </label>
      </div>

      <div tabIndex={0} onKeyDown={onKey} aria-label="Use arrow keys to change slice" className="mt-4 grid gap-4 rounded-xl sm:grid-cols-3">
        <Panel title="Original MRI"><img src={urls.original} alt={`Original ${plane} slice ${i + 1}`} className={fill} draggable={false} /></Panel>
        <Panel title="Predicted mask"><img src={urls.mask} alt={`Predicted mask, ${plane} slice ${i + 1}`} className={fill} draggable={false} /></Panel>
        <Panel title="Overlay">
          <img src={urls.original} alt="" className={fill} draggable={false} />
          <img src={urls.mask} alt={`Overlay, ${plane} slice ${i + 1}`} className={fill} style={{ opacity }} draggable={false} />
        </Panel>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn-secondary !px-2.5" onClick={() => setI(i - 1)} disabled={i <= 0} aria-label="Previous slice"><ChevronLeft className="h-4 w-4" /></button>
        <input type="range" min={0} max={total - 1} value={i} onChange={(e) => setI(Number(e.target.value))} className="h-2 flex-1 accent-teal-600" aria-label="Slice" />
        <button className="btn-secondary !px-2.5" onClick={() => setI(i + 1)} disabled={i >= total - 1} aria-label="Next slice"><ChevronRight className="h-4 w-4" /></button>
        <span className="w-28 text-right text-sm tabular-nums text-navy-600">Slice {i + 1} / {total}</span>
      </div>

      <div className="mt-4 grid gap-4 border-t border-navy-100 pt-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="opacity">Overlay opacity · {Math.round(opacity * 100)}%</label>
          <input id="opacity" type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="mt-2 h-2 w-full accent-teal-600" />
        </div>
        <div>
          <p className="label">Colors</p>
          <div className="mt-2 inline-flex rounded-xl bg-navy-100/70 p-1">
            {[["single", "Tumor (magenta)"], ["region", "By region"]].map(([k, name]) => (
              <button key={k} onClick={() => setStyle(k)} aria-pressed={style === k}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${style === k ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"}`}>{name}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {REGIONS.map((r) => {
          const on = labels.includes(r.id);
          return (
            <button key={r.id} onClick={() => toggle(r.id)} aria-pressed={on}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "border-navy-300 bg-white text-navy-900" : "border-navy-100 bg-navy-50 text-navy-400"}`}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: style === "single" ? MAGENTA : r.color, opacity: on ? 1 : 0.35 }} />
              {r.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
