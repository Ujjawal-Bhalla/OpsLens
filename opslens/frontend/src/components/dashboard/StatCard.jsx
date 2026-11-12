
import {
  BrainCircuit,
  Activity,
  Target,
  ShieldCheck,
} from 'lucide-react'

const icons = {
  brain: BrainCircuit,
  activity: Activity,
  target: Target,
  shield: ShieldCheck,
}

function StatCard({ title, value, change, icon }) {
  const Icon = icons[icon]

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 wrap-break-word text-sm font-medium text-slate-400">
          {title}
        </p>

        <div className="shrink-0 rounded-lg bg-cyan-500/10 p-2">
          {Icon && <Icon size={20} className="text-cyan-400" />}
        </div>
      </div>

      <h3 className="mt-5 wrap-break-word text-2xl font-bold text-white">
        {value}
      </h3>

      <p className="mt-2 wrap-break-word text-xs text-slate-500">
        {change}
      </p>
    </div>
  )
}

export default StatCard
