import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileJson, FileImage, AlertTriangle, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SliceViewer from "../components/SliceViewer.jsx";
import MaskComparison from "../components/MaskComparison.jsx";
import StatTile from "../components/StatTile.jsx";
import ProcessingTimeline from "../components/ProcessingTimeline.jsx";
import { downloadUrl, errorMessage, getResult } from "../services/api.js";

const REGION_ROWS = [["enhancing_tumor", "Enhancing tumor", "#f5c542"], ["necrotic_core", "Necrotic core", "#e5484d"], ["edema", "Edema", "#3fb68b"], ["tumor_core", "Tumor core", "#c2410c"], ["whole_tumor", "Whole tumor", "#d946ef"]];
const fmt = (v, d = 1, unit = "") => (v == null ? "—" : `${Number(v).toFixed(d)}${unit}`);

export default function ResultDetail() {
  const { id } = useParams();
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        for (;;) {
          const r = await getResult(id);
          if (stop) return;
          setRes(r);
          if (r.status === "completed" || r.status === "failed") return;
          await new Promise((ok) => setTimeout(ok, 1000));
        }
      } catch (e) { if (!stop) setError(errorMessage(e)); }
    })();
    return () => { stop = true; };
  }, [id]);

  const back = <Link to="/results" className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline"><ArrowLeft className="h-4 w-4" />All results</Link>;
  if (error) return <div className="space-y-4">{back}<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div></div>;
  if (!res) return <div className="flex items-center gap-2 text-navy-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;
  if (res.status === "failed") return <div className="space-y-4">{back}<div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-bold">Segmentation failed</p><p className="mt-1 text-sm">{res.error}</p></div></div></div>;
  if (res.status !== "completed") return <div className="space-y-4">{back}<section className="card p-6"><h2 className="mb-4 font-bold">Processing</h2><ProcessingTimeline phase={res.stage === "queued" ? "reading" : res.stage} progress={res.progress} /></section></div>;

  const s = res.stats, d = res.dims;
  const chart = REGION_ROWS.map(([k, name, color]) => ({ name, color, ml: s.regions[k].volume_ml ?? s.regions[k].voxels }));
  const unit = s.volume_ml == null ? "voxels" : "mL";

  return (
    <div className="space-y-6">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Segmentation result</h1>
          <p className="mt-1 text-sm text-navy-500">{res.input_names?.flair} · {new Date(res.created_at).toLocaleString()} · ID {res.id.slice(0, 8)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-primary" href={downloadUrl(id, "mask")}><Download className="h-4 w-4" />Mask (.nii.gz)</a>
          <a className="btn-secondary" href={downloadUrl(id, "overlay")}><FileImage className="h-4 w-4" />Overlay (.png)</a>
          <a className="btn-secondary" href={downloadUrl(id, "summary")}><FileJson className="h-4 w-4" />Summary (.json)</a>
        </div>
      </header>

      {res.warnings?.length > 0 && (
        <div role="alert" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {res.warnings.map((w) => <p key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</p>)}
        </div>
      )}
      {s.tumor_voxels === 0 && <div className="rounded-xl border border-navy-200 bg-white p-4 text-sm text-navy-700">The model did not find a tumor region in this scan.</div>}

      <MaskComparison id={id} comparison={res.comparison} onCompared={(comparison) => setRes((current) => ({ ...current, comparison }))} />

      <SliceViewer result={res} hasComparison={Boolean(res.comparison)} />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Predicted tumor volume" value={fmt(s.volume_ml, 1, " mL")} hint={s.volume_ml == null ? "Voxel spacing not valid" : "Whole tumor"} />
        <StatTile label="Tumor voxels" value={s.tumor_voxels.toLocaleString()} />
        <StatTile label="Share of brain volume" value={fmt(s.tumor_percent_of_brain, 2, " %")} hint={`${fmt(s.tumor_percent_of_volume, 3, " %")} of the full image`} />
        <StatTile label="Processing time" value={fmt(res.processing_time_s, 1, " s")} hint={`${res.device}${res.used_tta ? " · high accuracy" : ""}`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <h2 className="font-bold">Volume by region ({unit})</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} layout="vertical" margin={{ left: 24, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="#dde6f3" />
                <XAxis type="number" tick={{ fontSize: 12 }} /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(unit === "mL" ? 2 : 0)} ${unit}`, "Volume"]} />
                <Bar dataKey="ml" radius={[0, 6, 6, 0]}>{chart.map((c) => <Cell key={c.name} fill={c.color} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-bold">Scan details</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            {[["Slices (axial)", s.slices_processed], ["Dimensions", d.original_shape.join(" × ")], ["Voxel spacing (mm)", d.original_voxel_spacing_mm.join(" × ")], ["Original orientation", d.original_orientation], ["Model orientation", d.model_orientation]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-navy-500">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
            ))}
          </dl>
        </section>
      </div>
      <p className="text-xs text-navy-500">These measurements come from the model prediction and are not a diagnosis or a measure of severity. Always have a qualified professional review the images.</p>
    </div>
  );
}
