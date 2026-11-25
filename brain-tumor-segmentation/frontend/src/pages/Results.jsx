import { Link } from "react-router-dom";
import { Trash2, ScanSearch } from "lucide-react";
import StatusBadge from "../components/StatusBadge.jsx";
import { useToast } from "../components/Toast.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { deleteResult, errorMessage, listResults } from "../services/api.js";

export default function Results() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(listResults, []);

  async function remove(id) {
    if (!window.confirm("Delete this result and its stored images permanently?")) return;
    try { await deleteResult(id); toast("success", "Result deleted."); reload(); } catch (e) { toast("error", errorMessage(e)); }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold tracking-tight">Results</h1><p className="mt-1 text-navy-600">Every segmentation is stored privately on this computer.</p></div>
        <Link to="/segment" className="btn-primary"><ScanSearch className="h-4 w-4" />New segmentation</Link>
      </header>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessage(error)}</div>}
      {loading && !data ? <p className="text-sm text-navy-500">Loading…</p> : data?.length === 0 ? (
        <div className="card p-10 text-center text-navy-600">Nothing here yet. Your finished segmentations will appear in this list.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-navy-100 text-xs text-navy-500"><tr><th className="p-4 font-semibold">Scan</th><th className="p-4 font-semibold">Created</th><th className="p-4 font-semibold">Status</th><th className="p-4 text-right font-semibold">Tumor volume</th><th className="p-4 text-right font-semibold">Time</th><th className="p-4" /></tr></thead>
            <tbody className="divide-y divide-navy-100">
              {(data || []).map((r) => (
                <tr key={r.id} className="hover:bg-navy-50/50">
                  <td className="p-4"><Link to={`/results/${r.id}`} className="font-semibold text-navy-900 hover:text-teal-700">{r.input_names?.flair || r.id.slice(0, 8)}</Link><p className="text-xs text-navy-400">{r.id.slice(0, 8)}</p></td>
                  <td className="p-4 text-navy-600">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-4"><StatusBadge status={r.status} /></td>
                  <td className="p-4 text-right tabular-nums">{r.volume_ml != null ? `${r.volume_ml.toFixed(1)} mL` : "—"}</td>
                  <td className="p-4 text-right tabular-nums text-navy-600">{r.processing_time_s != null ? `${r.processing_time_s.toFixed(1)} s` : "—"}</td>
                  <td className="p-4 text-right"><button className="btn-ghost !p-2 text-red-600 hover:!bg-red-50" onClick={() => remove(r.id)} aria-label="Delete result"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
