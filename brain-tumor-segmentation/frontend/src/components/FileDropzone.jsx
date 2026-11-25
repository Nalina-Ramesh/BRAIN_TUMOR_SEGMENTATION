import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { formatBytes, isNiftiName, previewNifti, UNSUPPORTED_MESSAGE } from "../utils/niftiPreview.js";
import { useToast } from "./Toast.jsx";

/** One upload slot (one MRI sequence). Accepts only .nii / .nii.gz. */
export default function FileDropzone({ label, file, onFile, onRemove, disabled }) {
  const toast = useToast();
  const input = useRef(null);
  const canvas = useRef(null);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState({ state: "idle", info: null, message: "" });

  useEffect(() => {
    let cancelled = false;
    if (!file) { setPreview({ state: "idle", info: null, message: "" }); return; }
    setPreview({ state: "loading", info: null, message: "" });
    previewNifti(file)
      .then((p) => { if (!cancelled) setPreview({ state: "ready", info: p, message: "" }); })
      .catch((e) => { if (!cancelled) setPreview({ state: "nopreview", info: null, message: e.message }); });
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    const p = preview.info;
    if (preview.state !== "ready" || !p || !canvas.current) return;
    const c = canvas.current;
    c.width = p.width; c.height = p.height;
    c.getContext("2d").putImageData(new ImageData(p.rgba, p.width, p.height), 0, 0);
  }, [preview]);

  const accept = (f) => {
    if (!f) return;
    if (!isNiftiName(f.name)) { toast("error", UNSUPPORTED_MESSAGE); return; }
    if (f.size === 0) { toast("error", `${label}: the file is empty.`); return; }
    onFile(f);
  };
  const pick = () => !disabled && input.current?.click();

  if (!file) {
    return (
      <div>
        <p className="label mb-1.5">{label}</p>
        <div role="button" tabIndex={0} aria-label={`Choose ${label} file`} onClick={pick}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); !disabled && accept(e.dataTransfer.files?.[0]); }}
          className={`flex h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 text-center transition ${over ? "border-teal-500 bg-teal-50" : "border-navy-200 bg-white hover:border-teal-400 hover:bg-teal-50/40"} ${disabled ? "opacity-60" : ""}`}>
          <FileUp className="h-7 w-7 text-teal-600" />
          <p className="text-sm font-semibold text-navy-800">Drop file or <span className="text-teal-700 underline">browse</span></p>
          <p className="text-xs text-navy-500">.nii or .nii.gz only</p>
        </div>
        <input ref={input} type="file" accept=".nii,.gz,.nii.gz" className="hidden"
          onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    );
  }

  return (
    <div>
      <p className="label mb-1.5">{label}</p>
      <div className="card overflow-hidden">
        <div className="relative grid h-32 place-items-center bg-navy-950">
          {preview.state === "ready" && <canvas ref={canvas} className="h-full max-w-full object-contain" aria-label={`${label} preview`} />}
          {preview.state === "loading" && <Loader2 className="h-6 w-6 animate-spin text-teal-300" />}
          {preview.state === "nopreview" && (
            <p className="flex items-start gap-2 px-4 text-center text-xs text-navy-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />{preview.message}</p>
          )}
        </div>
        <div className="space-y-2 p-3">
          <p className="truncate text-sm font-semibold text-navy-900" title={file.name}>{file.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-navy-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" /> Ready · {formatBytes(file.size)}
            {preview.info && <span>· {preview.info.width}×{preview.info.height}×{preview.info.depth}</span>}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1 !py-1.5 text-xs" onClick={pick} disabled={disabled}><RefreshCw className="h-3.5 w-3.5" />Replace</button>
            <button type="button" className="btn-ghost !py-1.5 text-xs text-red-600 hover:!bg-red-50" onClick={onRemove} disabled={disabled}><Trash2 className="h-3.5 w-3.5" />Remove</button>
          </div>
        </div>
      </div>
      <input ref={input} type="file" accept=".nii,.gz,.nii.gz" className="hidden"
        onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
