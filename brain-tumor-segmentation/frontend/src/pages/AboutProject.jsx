import { ArrowRight, Database, Layers, Server, Monitor, FileCheck2 } from "lucide-react";

function Block({ title, children }) {
  return <section className="card p-6"><h2 className="font-bold">{title}</h2><div className="mt-2 space-y-2 text-sm leading-relaxed text-navy-700">{children}</div></section>;
}

const FLOW = [[Monitor, "React interface", "Upload, viewer, results"], [Server, "FastAPI backend", "Validation, jobs, REST API"], [Layers, "Preprocessing", "Orientation, normalization"], [Database, "3D U-Net (PyTorch)", "Sliding-window inference"], [FileCheck2, "Outputs", "NIfTI mask, overlay, statistics"]];

export default function AboutProject() {
  return (
    <div className="space-y-6">
      <header><p className="text-sm font-semibold text-teal-700">Academic project</p><h1 className="text-2xl font-extrabold tracking-tight">Brain Tumor Segmentation Using Deep Learning</h1></header>
      <Block title="Introduction"><p>Brain tumors such as gliomas have irregular shapes and blurry borders. Outlining them by hand on MRI is slow and differs between readers. Deep learning can produce a consistent first outline in seconds.</p></Block>
      <Block title="Problem statement"><p>Manual segmentation of volumetric MRI takes expert time and is hard to repeat exactly. The goal is an automatic, reproducible method that outlines the tumor and its sub-regions in new scans, together with an interface that lets a person inspect the result slice by slice.</p></Block>
      <Block title="Objectives">
        <ul className="list-disc space-y-1 pl-5"><li>Train a 3D U-Net on multi-sequence glioma MRI.</li><li>Segment whole tumor, tumor core and enhancing tumor.</li><li>Process new NIfTI scans end to end in a web application.</li><li>Report predicted volumes and export the mask in the scan's own coordinate space.</li></ul>
      </Block>
      <Block title="Proposed methodology"><p>Four co-registered sequences (FLAIR, T1, T1 with contrast, T2) are normalized inside the brain and fed to the network in 128³ patches during training. At prediction time a sliding window covers the whole volume with overlapping, smoothly weighted patches. The three sigmoid outputs are thresholded and combined into a BraTS-style label map.</p></Block>
      <section className="card p-6">
        <h2 className="font-bold">System architecture</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {FLOW.map(([Icon, t, s], i) => (
            <div key={t} className="relative rounded-xl bg-navy-50 p-4"><Icon className="h-5 w-5 text-teal-600" /><p className="mt-2 text-sm font-bold">{t}</p><p className="text-xs text-navy-500">{s}</p>{i < FLOW.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-navy-300 md:block" />}</div>
          ))}
        </div>
        <p className="mt-4 text-sm text-navy-700">The frontend and backend run independently and communicate through a REST API. Uploads are validated, processed in a background job, and stored privately on the local machine.</p>
      </section>
      <Block title="Expected outcomes"><p>A working tool that outlines glioma regions in compatible scans, shows them in three planes, measures their volumes, and exports results for review in standard viewers such as 3D Slicer.</p></Block>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><b>Medical disclaimer.</b> NeuroSeg AI is a research and decision-support tool. It does not diagnose, grade or recommend treatment, and it does not replace the judgment of a qualified medical professional.</div>
    </div>
  );
}
