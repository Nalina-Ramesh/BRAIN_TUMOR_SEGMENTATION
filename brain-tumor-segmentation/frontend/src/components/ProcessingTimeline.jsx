import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

// phase: "uploading" or a backend stage; progress: 0..1 for the active step
const STEPS = [
  { key: "uploading", label: "Uploading MRI scans" },
  { key: "reading", label: "Reading NIfTI volumes" },
  { key: "preprocessing", label: "Preprocessing scans" },
  { key: "inference", label: "Running segmentation model" },
  { key: "visualization", label: "Generating visualization", also: ["postprocessing"] },
  { key: "completed", label: "Segmentation completed" },
];

export default function ProcessingTimeline({ phase, progress = 0, failed = false }) {
  const activeIdx = Math.max(0, STEPS.findIndex((s) => s.key === phase || s.also?.includes(phase)));
  return (
    <ol className="space-y-3">
      {STEPS.map((s, i) => {
        const done = phase === "completed" || i < activeIdx;
        const active = i === activeIdx && phase !== "completed";
        return (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            {failed && active ? <XCircle className="h-5 w-5 text-red-500" />
              : done || (phase === "completed" && i === STEPS.length - 1) ? <CheckCircle2 className="h-5 w-5 text-teal-600" />
              : active ? <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
              : <Circle className="h-5 w-5 text-navy-200" />}
            <span className={done || active ? "font-semibold text-navy-900" : "text-navy-400"}>{s.label}</span>
            {active && !failed && s.key !== "completed" && <span className="ml-auto text-xs tabular-nums text-navy-500">{Math.round(progress * 100)}%</span>}
          </li>
        );
      })}
    </ol>
  );
}
