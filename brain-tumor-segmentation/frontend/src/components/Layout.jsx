import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Brain, FolderOpen, Info, LayoutDashboard, Menu, ScanSearch, Cpu, X } from "lucide-react";
import { getHealth } from "../services/api.js";
import { useAsync } from "../hooks/useAsync.js";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/segment", label: "New Segmentation", icon: ScanSearch },
  { to: "/results", label: "Results", icon: FolderOpen },
  { to: "/model", label: "About the Model", icon: Cpu },
  { to: "/project", label: "About the Project", icon: Info },
];

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/15 ring-1 ring-teal-400/40">
        <Brain className="h-5 w-5 text-teal-300" />
      </div>
      <div>
        <p className="text-base font-extrabold tracking-tight text-white">NeuroSeg AI</p>
        <p className="text-xs text-navy-300">Brain tumor segmentation</p>
      </div>
    </div>
  );
}

function BackendStatus() {
  const { data, error, loading } = useAsync(getHealth, []);
  const ok = !!data?.model_loaded;
  const text = loading ? "Checking backend…" : error ? "Backend offline" : ok ? `Model ready · ${data.device}` : "Model not loaded";
  const dot = loading ? "bg-navy-300" : ok ? "bg-teal-400" : "bg-red-400";
  return (
    <div className="mx-2 rounded-xl bg-white/5 px-3 py-2.5 text-xs text-navy-200">
      <span className={`mr-2 inline-block h-2 w-2 rounded-full ${dot}`} />
      {text}
    </div>
  );
}

function SideNav({ onNavigate }) {
  return (
    <div className="flex h-full flex-col gap-6 py-6">
      <Brand />
      <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white"}`}>
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <BackendStatus />
      <p className="px-4 text-[11px] leading-snug text-navy-400">Research decision-support tool. Not a medical diagnosis.</p>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 bg-navy-900 lg:block"><div className="sticky top-0 h-screen"><SideNav /></div></aside>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-900 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2 text-white"><Brain className="h-5 w-5 text-teal-300" /><span className="font-extrabold">NeuroSeg AI</span></div>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-white"><Menu className="h-6 w-6" /></button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-navy-900">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-3 text-white"><X className="h-5 w-5" /></button>
            <SideNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <main key={pathname} className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl"><Outlet /></div>
      </main>
    </div>
  );
}
