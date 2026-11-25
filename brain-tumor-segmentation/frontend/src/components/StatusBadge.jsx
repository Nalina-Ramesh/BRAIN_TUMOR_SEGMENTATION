const MAP = {
  completed: "bg-teal-50 text-teal-700 ring-teal-200",
  processing: "bg-amber-50 text-amber-700 ring-amber-200",
  queued: "bg-navy-50 text-navy-600 ring-navy-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
};
export default function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ${MAP[status] || MAP.queued}`}>{status}</span>;
}
