
import { Bell, Search, CircleUserRound } from 'lucide-react'

function Topbar() {
  return (
    <header className="flex h-20 min-w-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 sm:px-8">
      <div>
        <h2 className="text-lg font-semibold text-white">
          Welcome to OpsLens
        </h2>
        <p className="text-sm text-slate-500">
          Infrastructure intelligence at a glance
        </p>
      </div>

      <div className="flex items-center gap-5">
        <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 md:flex">
          <Search size={17} className="text-slate-500" />
          <input
            type="text"
            placeholder="Search..."
            className="w-36 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        </div>

        <button className="relative text-slate-400 transition hover:text-white">
          <Bell size={20} />
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-cyan-400" />
        </button>

        <div className="flex items-center gap-3 border-l border-slate-800 pl-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
            <CircleUserRound size={21} />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-white">Admin</p>
            <p className="text-xs text-slate-500">Administrator</p>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Topbar
