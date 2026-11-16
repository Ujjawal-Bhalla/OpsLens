import { Activity } from 'lucide-react'

function Topbar() {
  return (
    <header className="flex h-16 min-w-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 sm:px-8">
      <div>
        <h2 className="text-base font-semibold text-white">
          OpsLens Operational Monitor
        </h2>
        <p className="text-xs text-slate-500">
          Infrastructure intelligence & anomaly detection
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
        <Activity size={14} className="animate-pulse" />
        <span>System Active</span>
      </div>
    </header>
  )
}

export default Topbar
