import { ArrowDown } from "lucide-react";
import { useAsync } from "../hooks/useAsync.js";
import { errorMessage, getModelInfo, getTrainingInfo } from "../services/api.js";

function Row({ k, v }) {
  if (v == null || v === "") return null;
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-6">
      <dt className="text-sm font-semibold text-navy-500">{k}</dt>
      <dd className="text-sm sm:col-span-2">{Array.isArray(v) ? <ul className="list-disc space-y-1 pl-4">{v.map((x) => <li key={x}>{x}</li>)}</ul> : v}</dd>
    </div>
  );
}

export default function AboutModel() {
  const model = useAsync(getModelInfo, []);
  const train = useAsync(getTrainingInfo, []);
  const m = model.data, t = train.data;
  const dice = m?.recorded_val_dice;

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-extrabold tracking-tight">About the model</h1><p className="mt-1 max-w-3xl text-navy-600">Everything on this page is read from the loaded checkpoint and from <code className="rounded bg-navy-100 px-1">backend/training_info.json</code>. Nothing is estimated.</p></header>
      {(model.error || train.error) && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessage(model.error || train.error)}</div>}

      {m?.channels && (
        <section className="card p-6">
          <h2 className="font-bold">Architecture</h2>
          <p className="mt-1 text-sm text-navy-600">A volumetric U-Net: the encoder shrinks the image while adding feature channels, the decoder restores resolution, and skip connections carry fine detail across.</p>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div>
              <p className="label mb-2">Encoder (each step halves the volume)</p>
              <ol className="space-y-2">{m.channels.map((c, i) => <li key={i} className="flex items-center gap-3 text-sm"><span className="h-8 rounded-lg bg-navy-800 px-3 py-1.5 font-semibold tabular-nums text-white" style={{ width: `${30 + (i / (m.channels.length - 1)) * 70}%` }}>{c} channels</span><span className="text-navy-500">{i === m.channels.length - 1 ? "bottleneck" : `level ${i + 1}`}</span></li>)}</ol>
            </div>
            <div>
              <p className="label mb-2">Decoder (mirrors the encoder)</p>
              <ol className="space-y-2">{[...m.channels].slice(0, -1).reverse().map((c, i) => <li key={i} className="flex items-center gap-3 text-sm"><span className="h-8 rounded-lg bg-teal-600 px-3 py-1.5 font-semibold tabular-nums text-white" style={{ width: `${100 - ((i + 1) / m.channels.length) * 70}%` }}>{c} channels</span><span className="text-navy-500">+ skip connection</span></li>)}</ol>
              <p className="mt-3 flex items-center gap-2 text-sm text-navy-600"><ArrowDown className="h-4 w-4" />Final 1×1×1 convolution gives {m.output_regions.length} output maps</p>
            </div>
          </div>
        </section>
      )}

      <section className="card p-6">
        <h2 className="font-bold">Loaded model</h2>
        <dl className="divide-y divide-navy-100">
          <Row k="Status" v={m ? (m.loaded ? "Loaded" : `Not loaded: ${m.error}`) : "…"} />
          <Row k="Type" v={m?.architecture} />
          <Row k="Input" v={m && `${m.input_channels.join(", ")} (4 channels), patches of ${m.patch_size.join("×")} voxels`} />
          <Row k="Output" v={m?.output_regions} />
          <Row k="Parameters" v={m?.parameters?.toLocaleString()} />
          <Row k="Checkpoint" v={m?.checkpoint_file && `${m.checkpoint_file}${m.checkpoint_epoch ? ` (epoch ${m.checkpoint_epoch})` : ""}`} />
          <Row k="Device" v={m?.device} />
        </dl>
      </section>

      {dice && (
        <section className="card p-6">
          <h2 className="font-bold">Validation Dice recorded in the checkpoint</h2>
          <p className="mt-1 text-sm text-navy-600">Measured during training on a subset of the validation split of the training dataset. It says nothing about scans from other sources.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">{Object.entries(dice).map(([k, v]) => <div key={k} className="rounded-xl bg-navy-50 p-4"><p className="label">{k === "WT" ? "Whole tumor" : k === "TC" ? "Tumor core" : k === "ET" ? "Enhancing tumor" : k}</p><p className="mt-1 text-2xl font-bold tabular-nums">{Number(v).toFixed(3)}</p></div>)}</div>
        </section>
      )}

      {t && (
        <section className="card p-6">
          <h2 className="font-bold">Training and preprocessing</h2>
          <dl className="divide-y divide-navy-100">
            <Row k="Dataset" v={t.dataset} /><Row k="Loss function" v={t.loss} /><Row k="Optimizer" v={t.optimizer} />
            <Row k="Learning-rate schedule" v={t.scheduler} /><Row k="Epochs" v={t.epochs} /><Row k="Batch size" v={t.batch_size} />
            <Row k="Preprocessing" v={t.preprocessing} /><Row k="Augmentation" v={t.augmentation} />
            <Row k="Inference" v={t.inference} /><Row k="Evaluation metric" v={t.evaluation} />
          </dl>
          <p className="mt-3 text-xs text-navy-500">{t.source}</p>
        </section>
      )}
    </div>
  );
}
