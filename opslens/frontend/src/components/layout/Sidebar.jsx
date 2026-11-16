
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  BrainCircuit,
  Activity,
  ChartNoAxesCombined,
  ShieldCheck,
  History,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Models', path: '/models', icon: BrainCircuit },
  { name: 'Anomaly Detection', path: '/detection', icon: Activity },
  { name: 'Detection History', path: '/history', icon: History },
  { name: 'Analytics', path: '/analytics', icon: ChartNoAxesCombined },
]

function Sidebar() {
  return (
   <aside className="flex h-full w-full shrink-0 flex-col overflow-x-hidden border-r border-slate-800 bg-slate-950 text-slate-300">
      {/* Logo */}
      <div className="flex h-20 shrink-0 items-center justify-center gap-3 border-b border-slate-800 px-2 sm:justify-start sm:px-6">
        <div className="shrink-0 rounded-xl bg-cyan-500/10 p-2">
          <ShieldCheck className="h-6 w-6 text-cyan-400" />
        </div>

        <div className="hidden min-w-0 sm:block">
          <h1 className="text-xl font-bold tracking-wide text-white">
            OpsLens
          </h1>
          <p className="text-xs text-slate-500">MLOps Monitoring</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="min-w-0 px-2 py-6 sm:px-4">
        <p className="mb-4 hidden px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:block">
          Workspace
        </p>

        <nav className="space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                title={item.name}
                className={({ isActive }) =>
                  `flex min-w-0 items-center justify-center gap-3 rounded-lg px-2 py-3 text-sm font-medium transition sm:justify-start sm:px-3 ${
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-400'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                  }`
                }
              >
                <Icon size={19} className="shrink-0" />
                <span className="hidden truncate sm:block">
                  {item.name}
                </span>
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* Bottom section */}
      <div className="mt-auto shrink-0 border-t border-slate-800 p-2 sm:p-4">
        <p className="px-3 text-xs text-slate-600 sm:block">
          OpsLens v1.0.0
        </p>
      </div>
    </aside>
  )
}

export default Sidebar
