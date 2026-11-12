
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Activity,
  RefreshCw,
  BrainCircuit,
} from 'lucide-react'

import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts'

import { getDashboardSummary } from '../api/dashboard'
import { getModels } from '../api/models'

function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [modelInfo, setModelInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      setError('')

      const [dashboardData, modelsData] = await Promise.all([
        getDashboardSummary(),
        getModels(),
      ])

      setSummary(dashboardData)
      setModelInfo(modelsData)
    } catch (err) {
      console.error('Dashboard API error:', err)
      setError(
        err.response?.data?.detail ||
        'Unable to load dashboard data.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
  const timer = setTimeout(() => {
    fetchDashboard()
  }, 0)

  return () => clearTimeout(timer)
}, [])

  const formatDate = (date) => {
    if (!date) return 'N/A'

    const normalized = date.includes('T')
      ? date
      : `${date.replace(' ', 'T')}Z`

    return new Date(normalized).toLocaleString()
  }

  const stats = [
    {
      title: 'Total Detection Runs',
      value: summary?.total_runs ?? 0,
      icon: Activity,
      color: 'text-blue-400',
    },
    {
      title: 'Anomalous Observations',
      value: summary?.total_anomalous_observations ?? 0,
      icon: AlertTriangle,
      color: 'text-orange-400',
    },
    {
      title: 'Normal Runs',
      value: summary?.normal_runs ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-400',
    },
    {
      title: 'Models Used',
      value: summary?.models_used ?? 0,
      icon: BrainCircuit,
      color: 'text-cyan-400',
    },
  ]

  return (
    <div className="w-full min-w-0 space-y-8">

      {/* Page heading */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Monitor your infrastructure and anomaly detection activity.
          </p>
        </div>

        <button
          onClick={fetchDashboard}
          disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={loading ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
          <button
            onClick={fetchDashboard}
            className="ml-2 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Statistics */}
      <div className="grid w-full min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon

          return (
            <div
              key={stat.title}
              className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/70 p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-400">
                  {stat.title}
                </p>
                <Icon size={21} className={stat.color} />
              </div>

              <h2 className="mt-4 text-3xl font-bold text-white">
                {loading ? '—' : stat.value.toLocaleString()}
              </h2>
            </div>
          )
        })}
      </div>

      {/* Chart and model overview */}
      <div className="grid w-full min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">

        {/* Detection activity chart */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold text-white">
            Detection Activity
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Detection runs over the last seven calendar days
          </p>

          <div className="mt-6 h-72 w-full">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Loading activity...
              </div>
            ) : summary?.daily_activity?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.daily_activity}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#334155"
                  />

                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(date) =>
                      new Date(`${date}T00:00:00`).toLocaleDateString(
                        undefined,
                        { day: 'numeric', month: 'short' }
                      )
                    }
                  />

                  <YAxis
                    stroke="#94a3b8"
                    allowDecimals={false}
                  />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                  />

                  <Bar
                    dataKey="total_runs"
                    name="Detection Runs"
                    fill="#22d3ee"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Activity size={30} className="text-slate-600 mb-3" />
                <p className="text-sm text-slate-400">
                  No detection activity recorded yet.
                </p>
                <Link
                  to="/detection"
                  className="mt-3 text-sm text-cyan-400 hover:text-cyan-300"
                >
                  Run your first detection
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Model overview */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold text-white">
            Model Overview
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Training summary
          </p>

          <div className="mt-8 space-y-6">
            <div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-slate-400">Models trained</span>
                <span className="font-semibold text-white">
                  {modelInfo?.total_models ?? '—'}
                </span>
              </div>

              <div className="mt-2 h-2 rounded-full bg-slate-800">
                <div
                  className="h-2 rounded-full bg-cyan-400"
                  style={{
                    width: `${
                      modelInfo?.total_models
                        ? 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-slate-400">Files skipped</span>
                <span className="font-semibold text-white">
                  {modelInfo?.skipped_files ?? '—'}
                </span>
              </div>
            </div>

            <div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-slate-400">CSV files discovered</span>
                <span className="font-semibold text-white">
                  {modelInfo?.discovered_csv_files ?? '—'}
                </span>
              </div>
            </div>
          </div>

          <Link
            to="/models"
            className="mt-8 flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300"
          >
            Explore models
            <ArrowUpRight size={16} />
          </Link>

          <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 size={18} />
              <span className="text-sm font-medium">
                Training artifacts available
              </span>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Model information is loaded from the training manifest.
            </p>
          </div>
        </div>
      </div>

      {/* Recent detection runs */}
      <div className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-6">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white">
              Recent Detection Runs
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Latest detection activity from your database
            </p>
          </div>

          <Link
            to="/history"
            className="flex shrink-0 items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300"
          >
            View all <ArrowUpRight size={16} />
          </Link>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">
            Loading recent detections...
          </div>
        ) : !summary?.recent_runs?.length ? (
          <div className="p-10 text-center">
            <Clock size={30} className="mx-auto text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">
              No detection runs recorded yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {summary.recent_runs.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5 transition hover:bg-slate-800/40"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="shrink-0 rounded-lg bg-orange-500/10 p-3">
                    {run.anomaly_count > 0 ? (
                      <AlertTriangle
                        className="text-orange-400"
                        size={20}
                      />
                    ) : (
                      <CheckCircle2
                        className="text-emerald-400"
                        size={20}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="font-medium text-white">
                      Detection Run #{run.id}
                    </p>
                    <p
                      className="mt-1 max-w-64 truncate text-xs text-slate-500"
                      title={run.model_id}
                    >
                      {run.model_id}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <span className="text-sm text-slate-400">
                    {run.observation_count} observations
                  </span>

                  <span className={
                    run.anomaly_count > 0
                      ? 'text-sm font-medium text-orange-400'
                      : 'text-sm font-medium text-emerald-400'
                  }>
                    {run.anomaly_count} anomalies
                  </span>

                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock size={14} />
                    {formatDate(run.created_at)}
                  </span>

                  <Link
                    to={`/history/${run.id}`}
                    className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

export default Dashboard
