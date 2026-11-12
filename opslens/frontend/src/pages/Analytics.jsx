
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Percent,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  CartesianGrid,
  XAxis,
  YAxis,
  ComposedChart,
  Line,
    Bar,
} from 'recharts'

import { getAnalyticsSummary } from '../api/analytics'

function Analytics() {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      setError('')

      const data = await getAnalyticsSummary()
      setAnalytics(data)
    } catch (err) {
      console.error('Analytics API error:', err)
      setError(
        err.response?.data?.detail ||
        'Unable to load analytics data.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
  const timer = setTimeout(() => {
    fetchAnalytics()
  }, 0)

  return () => clearTimeout(timer)
}, [])
  const summary = analytics?.summary
  const distribution = analytics?.distribution || {}
  const dailyTrends = analytics?.daily_trends || []
  const modelUsage = analytics?.model_usage || []
  const runRates = analytics?.run_anomaly_rates || []

  const cards = [
    {
      title: 'Total Observations',
      value: summary?.total_observations ?? 0,
      icon: Activity,
      color: 'text-blue-400',
    },
    {
      title: 'Anomalies Detected',
      value: summary?.total_anomalies ?? 0,
      icon: AlertTriangle,
      color: 'text-orange-400',
    },
    {
      title: 'Normal Observations',
      value: summary?.normal_observations ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-400',
    },
    {
      title: 'Anomaly Rate',
      value: `${summary?.anomaly_rate ?? 0}%`,
      icon: Percent,
      color: 'text-purple-400',
    },
  ]

  const pieData = [
    {
      name: 'Normal',
      value: distribution.normal || 0,
    },
    {
      name: 'Anomalous',
      value: distribution.anomalous || 0,
    },
  ]

  const formatDate = (date) => {
    if (!date) return 'N/A'

    const normalized = date.includes('T')
      ? date
      : `${date.replace(' ', 'T')}Z`

    return new Date(normalized).toLocaleString()
  }

  return (
    <div className="w-full min-w-0 space-y-8">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Explore anomaly detection performance and activity.
          </p>
        </div>

        <button
          onClick={fetchAnalytics}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
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
            onClick={fetchAnalytics}
            className="ml-2 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon

          return (
            <div
              key={card.title}
              className="rounded-xl border border-slate-800 bg-slate-900/70 p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-400">
                  {card.title}
                </p>
                <Icon size={21} className={card.color} />
              </div>

              <h2 className="mt-4 text-3xl font-bold text-white">
                {loading ? '—' : card.value.toLocaleString?.() ?? card.value}
              </h2>
            </div>
          )
        })}
      </div>

      {/* Distribution and daily trends */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

        {/* Anomaly distribution */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold text-white">
            Observation Distribution
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Normal vs anomalous observations
          </p>

          <div className="mt-5 h-72">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Loading distribution...
              </div>
            ) : summary?.total_observations > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={55}
                    paddingAngle={3}
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f59e0b" />
                  </Pie>

                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  />

                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No observations available yet.
              </div>
            )}
          </div>
        </div>

        {/* Daily trends */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold text-white">
            Daily Detection Trends
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Activity over the last 30 days
          </p>

          <div className="mt-5 h-72">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Loading trends...
              </div>
            ) : dailyTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTrends}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#334155"
                  />

                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    tick={{ fontSize: 11 }}
                  />

                  <YAxis
                    yAxisId="left"
                    stroke="#94a3b8"
                    allowDecimals={false}
                  />

                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#f59e0b"
                    allowDecimals={false}
                  />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  />

                  <Legend />

                  <Bar
                    yAxisId="left"
                    dataKey="total_runs"
                    name="Detection Runs"
                    fill="#22d3ee"
                    radius={[4, 4, 0, 0]}
                  />

                  <Line
                    yAxisId="right"
                    dataKey="total_anomalies"
                    name="Anomalies"
                    stroke="#f59e0b"
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No daily activity available yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Model usage */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
        <div className="border-b border-slate-800 p-6">
          <h3 className="text-lg font-semibold text-white">
            Model Usage
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Detection runs grouped by model
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">
            Loading model usage...
          </div>
        ) : modelUsage.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            No model usage data available yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/50 text-slate-400">
                <tr>
                  <th className="px-5 py-4">Model ID</th>
                  <th className="px-5 py-4">Runs</th>
                  <th className="px-5 py-4">Observations</th>
                  <th className="px-5 py-4">Anomalies</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {modelUsage.map((model) => (
                  <tr
                    key={model.model_id}
                    className="text-slate-300 hover:bg-slate-800/40"
                  >
                    <td className="max-w-80 truncate px-5 py-4 text-white">
                      {model.model_id}
                    </td>
                    <td className="px-5 py-4">
                      {model.total_runs}
                    </td>
                    <td className="px-5 py-4">
                      {model.total_observations}
                    </td>
                    <td className="px-5 py-4 text-orange-400">
                      {model.total_anomalies}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Run anomaly rates */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
        <div className="border-b border-slate-800 p-6">
          <h3 className="text-lg font-semibold text-white">
            Recent Run Anomaly Rates
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Anomaly percentage for the latest ten detection runs
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">
            Loading run statistics...
          </div>
        ) : runRates.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            No detection runs available yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/50 text-slate-400">
                <tr>
                  <th className="px-5 py-4">Run</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Observations</th>
                  <th className="px-5 py-4">Anomalies</th>
                  <th className="px-5 py-4">Anomaly Rate</th>
                  <th className="px-5 py-4">Details</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {runRates.map((run) => (
                  <tr
                    key={run.id}
                    className="text-slate-300 hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-4 text-white">
                      #{run.id}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      {formatDate(run.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      {run.observation_count}
                    </td>
                    <td className="px-5 py-4 text-orange-400">
                      {run.anomaly_count}
                    </td>
                    <td className="px-5 py-4">
                      {run.anomaly_rate}%
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        to={`/history/${run.id}`}
                        className="text-cyan-400 hover:text-cyan-300"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <TrendingUp
          size={18}
          className="mt-0.5 shrink-0 text-blue-400"
        />
        <p className="text-xs leading-relaxed text-slate-400">
          Analytics are calculated from saved detection runs.
          Repeated submissions of the same observations are counted
          separately. Anomaly rate represents the share of predictions
          flagged by the model, not verified real-world incidents.
        </p>
      </div>
    </div>
  )
}

export default Analytics
