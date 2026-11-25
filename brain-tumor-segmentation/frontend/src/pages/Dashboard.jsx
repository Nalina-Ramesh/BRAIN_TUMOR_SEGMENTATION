import { Link } from "react-router-dom";
import { Activity, ArrowRight, Cpu, FolderOpen, ScanSearch, ShieldCheck } from "lucide-react";
import StatTile from "../components/StatTile.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { errorMessage, getModelInfo, getSession, listResults } from "../services/api.js";

export default function Dashboard() {
  const model = useAsync(getModelInfo, []);
  const session = useAsync(getSession, []);
  const results = useAsync(listResults, []);
  const m = model.data;
  const recent = (results.data || []).slice(0, 5);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-navy-900 p-7 text-white sm:p-10">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-teal-500/20 blur-3xl" aria-hidden />
        <p className="text-sm font-semibold text-teal-300">Welcome to NeuroSeg AI</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Brain tumor segmentation from volumetric MRI</h1>
        <p className="mt-3 max-w-2xl text-navy-200">Upload four MRI sequences of one patient in NIfTI format. The trained 3D U-Net outlines the tumor, separates its regions, and measures their volume. You can then scroll through every slice.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/segment" className="btn-primary"><ScanSearch className="h-4 w-4" />Start new segmentation</Link>
          <Link to="/results" className="btn bg-white/10 text-white hover:bg-white/20"><FolderOpen className="h-4 w-4" />View results</Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Scans processed this session" value={session.data?.processed_this_session} icon={Activity} hint={session.error ? errorMessage(session.error) : "Counted since the backend started"} />
        <StatTile label="Model status" value={model.loading ? "Checking…" : m?.loaded ? "Loaded" : "Not loaded"} icon={Cpu} hint={m ? `Running on ${m.device}` : model.error ? errorMessage(model.error) : ""} />
        <StatTile label="Stored results" value={session.data?.stored_results} icon={ShieldCheck} hint="Saved locally on this computer" />
      </div>
      {m && !m.loaded && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><b>The model could not be loaded.</b> {m.error}</div>}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between"><h2 className="font-bold">Recent activity</h2><Link to="/results" className="text-sm font-semibold text-teal-700 hover:underline">All results</Link></div>
          {results.loading ? <p className="mt-4 text-sm text-navy-500">Loading…</p> : recent.length === 0 ? (
            <div className="mt-4 rounded-xl bg-navy-50 p-5 text-sm text-navy-600">No segmentations yet. <Link to="/segment" className="font-semibold text-teal-700 hover:underline">Run your first one</Link>.</div>
          ) : (
            <ul className="mt-3 divide-y divide-navy-100">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link to={`/results/${r.id}`} className="flex items-center gap-3 py-3 hover:bg-navy-50/60">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{r.input_names?.flair || r.id.slice(0, 8)}</p><p className="text-xs text-navy-500">{new Date(r.created_at).toLocaleString()}</p></div>
                    <StatusBadge status={r.status} /><ArrowRight className="h-4 w-4 text-navy-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-bold">Model architecture</h2>
          {m ? (
            <dl className="mt-3 space-y-2.5 text-sm">
              {[["Type", m.architecture], ["Inputs", m.input_channels.join(", ")], ["Outputs", m.output_regions.join(", ")], ["Patch size", m.patch_size.join(" × ")], ["Parameters", m.parameters?.toLocaleString()], ["Checkpoint", m.checkpoint_file]].map(([k, v]) => v && (
                <div key={k} className="flex justify-between gap-4"><dt className="text-navy-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
              ))}
            </dl>
          ) : <p className="mt-3 text-sm text-navy-500">{model.error ? errorMessage(model.error) : "Loading…"}</p>}
          <Link to="/model" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline">Details <ArrowRight className="h-3.5 w-3.5" /></Link>
        </section>
      </div>
    </div>
  );
}
