import { useState } from "react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { compareReferenceMask, errorMessage } from "../services/api.js";

const METRICS = [
  ["Dice", "dice"],
  ["IoU", "iou"],
  ["Precision", "precision"],
  ["Sensitivity", "sensitivity"],
  ["Voxel accuracy", "voxel_accuracy"],
];
const percent = (value) => `${(value * 100).toFixed(2)}%`;

export default function MaskComparison({ id, comparison, onCompared }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!file) return;
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    try {
      onCompared(await compareReferenceMask(id, file));
      setFile(null);
      form.reset();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-bold">Compare with a reference mask</h2>
        <p className="mt-1 text-sm text-navy-600">
          Upload this scan’s ground-truth NIfTI mask (.nii or .nii.gz). It must share the original MRI voxel grid.
          BraTS label 4 is treated as enhancing tumor (label 3).
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm">
          <span className="label mb-1.5 block">Reference segmentation mask</span>
          <input type="file" accept=".nii,.nii.gz" onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full rounded-lg border border-navy-200 bg-white p-2 text-sm" />
        </label>
        <button className="btn-primary" type="submit" disabled={!file || busy}>
          <Upload className="h-4 w-4" />{busy ? "Comparing…" : "Compare masks"}
        </button>
      </form>

      {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
      </div>}

      {comparison && (
        <div className="space-y-3 border-t border-navy-100 pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-teal-800">
            <CheckCircle2 className="h-4 w-4" />Whole-tumor overlap comparison
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {METRICS.map(([label, key]) => (
              <div key={key} className="rounded-xl bg-navy-50 p-3">
                <dt className="text-xs text-navy-500">{label}</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums">{percent(comparison.metrics[key])}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-navy-500">
            Voxel accuracy includes background and can look high even when tumor overlap is poor.
            Dice and IoU are more informative for segmentation overlap.
          </p>
          {comparison.metrics.true_positive_voxels === 0 && comparison.metrics.dice < 1 && (
            <div role="status" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>No tumor voxels overlap in this scan, so the yellow overlap color will not appear.
                Magenta and cyan show the prediction-only and reference-only regions.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy-600">
            <span>Agreement: {comparison.metrics.true_positive_voxels.toLocaleString()} voxels</span>
            <span>Predicted only: {comparison.metrics.false_positive_voxels.toLocaleString()}</span>
            <span>Reference only (missed): {comparison.metrics.false_negative_voxels.toLocaleString()}</span>
          </div>
        </div>
      )}
    </section>
  );
}
