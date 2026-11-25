export default function StatTile({ label, value, hint, icon: Icon }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="label">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-teal-600" />}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-navy-900">{value ?? "—"}</p>
      {hint && <p className="mt-1 text-xs text-navy-500">{hint}</p>}
    </div>
  );
}
