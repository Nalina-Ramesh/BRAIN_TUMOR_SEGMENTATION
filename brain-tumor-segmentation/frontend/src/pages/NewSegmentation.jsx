import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Play, ShieldAlert } from "lucide-react";
import FileDropzone from "../components/FileDropzone.jsx";
import ProcessingTimeline from "../components/ProcessingTimeline.jsx";
import { useToast } from "../components/Toast.jsx";
import { errorMessage, getResult, startSegmentation } from "../services/api.js";

const SLOTS = [["flair", "FLAIR"], ["t1", "T1"], ["t1c", "T1 with contrast"], ["t2", "T2"]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function NewSegmentation() {
  const toast = useToast();
  const nav = useNavigate();
  const [files, setFiles] = useState({ flair: null, t1: null, t1c: null, t2: null });
  const [tta, setTta] = useState(false);
  const [run, setRun] = useState({ active: false, phase: "uploading", progress: 0, error: "" });
  const cancelled = useRef(false);

  const ready = SLOTS.every(([k]) => files[k]);
  const set = (k, f) => setFiles((s) => ({ ...s, [k]: f }));

  async function start() {
    cancelled.current = false;
    setRun({ active: true, phase: "uploading", progress: 0, error: "" });
    try {
      const job = await startSegmentation(files, tta, (e) => setRun((r) => ({ ...r, phase: "uploading", progress: e.total ? e.loaded / e.total : 0 })));
      for (;;) {
        const m = await getResult(job.id);
        if (m.status === "failed") throw new Error(m.error || "Segmentation failed.");
        if (m.status === "completed") { setRun({ active: false, phase: "completed", progress: 1, error: "" }); toast("success", "Segmentation completed."); nav(`/results/${job.id}`); return; }
        setRun((r) => ({ ...r, phase: m.stage === "queued" ? "reading" : m.stage, progress: m.progress }));
        await sleep(1000);
        if (cancelled.current) return;
      }
    } catch (e) {
      const msg = e instanceof Error && !e.response && !e.request ? e.message : errorMessage(e);
      setRun((r) => ({ ...r, active: false, error: msg }));
      toast("error", msg);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">New segmentation</h1>
        <p className="mt-1 max-w-3xl text-navy-600">The model reads four sequences from the same patient and session. Add all four to continue.</p>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-navy-200 bg-white p-4 text-sm text-navy-700">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
        <p>Only <b>.nii</b> and <b>.nii.gz</b> files are accepted. Scans must be registered to each other, about 1 mm voxels, and <b>skull-stripped</b>, like BraTS data. Photos, screenshots, DICOM and ZIP files are not supported.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SLOTS.map(([k, label]) => <FileDropzone key={k} label={label} file={files[k]} onFile={(f) => set(k, f)} onRemove={() => set(k, null)} disabled={run.active} />)}
      </div>

      {run.error && !run.active && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{run.error}</p></div>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={tta} onChange={(e) => setTta(e.target.checked)} disabled={run.active} className="h-4 w-4 accent-teal-600" />
          <span><b>Higher accuracy mode</b> <span className="text-navy-500">(about 4× slower)</span></span>
        </label>
        <button className="btn-primary !px-6 !py-3" onClick={start} disabled={!ready || run.active}><Play className="h-4 w-4" />{run.active ? "Segmenting…" : "Start segmentation"}</button>
      </div>

      {run.active && (
        <section className="card p-6" aria-live="polite">
          <h2 className="mb-4 font-bold">Processing</h2>
          <ProcessingTimeline phase={run.phase} progress={run.progress} />
          <p className="mt-4 text-xs text-navy-500">Keep this page open. A full scan usually takes under a minute on a GPU and several minutes on CPU.</p>
        </section>
      )}
    </div>
  );
}
