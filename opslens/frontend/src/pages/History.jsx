
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  History as HistoryIcon,
  ChevronRight,
} from 'lucide-react'

import { getDetectionHistory } from '../api/history'

function History() {
  const [history, setHistory] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchHistory = async () => {
    try {
      setLoading(true)
      setError('')

      const data = await getDetectionHistory(50, 0)

      setHistory(data.history || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('History API error:', err)
      setError(
        err.response?.data?.detail ||
        'Unable to load detection history.'
      )
    } finally {
      setLoading(false)
    }
  }

 useEffect(() => {
  const timer = setTimeout(() => {
    fetchHistory()
  }, 0)

  return () => clearTimeout(timer)
}, [])

  const totalAnomalies = history.reduce(
    (sum, run) => sum + run.anomaly_count,
    0
  )

  const normalRuns = history.filter(
    (run) => run.anomaly_count === 0
  ).length

  const formatDate = (date) => {
    return new Date(`${date.replace(' ', 'T')}Z`).toLocaleString()
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
            <HistoryIcon size={16} />
            <span>Monitoring</span>
            <ChevronRight size={14} />
            <span>History</span>
          </div>

          <h1 className="text-2xl font-bold text-white">
            Detection History
          </h1>

          <p className="text-slate-400 mt-1">
            Review your previous anomaly detection runs.
          </p>
        </div>

        <button
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={loading ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm">Total Runs</p>
            <Activity className="text-blue-400" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-white mt-3">
            {total}
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm">Anomalies Detected</p>
            <AlertTriangle className="text-amber-400" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-white mt-3">
            {totalAnomalies}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Across the displayed runs
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm">Normal Runs</p>
            <CheckCircle2 className="text-emerald-400" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-white mt-3">
            {normalRuns}
          </h2>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">
            Recent Detection Runs
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Showing the latest {history.length} records
          </p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">
            Loading detection history...
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={fetchHistory}
              className="mt-3 text-blue-400 hover:text-blue-300"
            >
              Try again
            </button>
          </div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center">
            <Clock size={32} className="mx-auto text-slate-500 mb-3" />
            <p className="text-white font-medium">
              No detection history yet
            </p>
            <p className="text-slate-400 text-sm mt-1">
              Run your first detection to see it here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-slate-400 bg-slate-950/50">
                <tr>
                  <th className="px-5 py-4">Run ID</th>
                  <th className="px-5 py-4">Model ID</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Observations</th>
                  <th className="px-5 py-4">Anomalies</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Details</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {history.map((run) => (
                  <tr
                    key={run.id}
                    className="text-slate-300 hover:bg-slate-800/50 transition"
                  >
                    <td className="px-5 py-4 font-medium text-white">
                      #{run.id}
                    </td>

                    <td className="px-5 py-4 max-w-56">
                      <span className="block truncate" title={run.model_id}>
                        {run.model_id}
                      </span>
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap">
                      {formatDate(run.created_at)}
                    </td>

                    <td className="px-5 py-4">
                      {run.observation_count}
                    </td>

                    <td className="px-5 py-4">
                      <span className={
                        run.anomaly_count > 0
                          ? 'text-amber-400 font-medium'
                          : 'text-emerald-400'
                      }>
                        {run.anomaly_count}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {run.anomaly_count > 0 ? (
                        <span className="px-2.5 py-1 rounded-full text-xs bg-amber-500/10 text-amber-400">
                          Anomalies Found
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs bg-emerald-500/10 text-emerald-400">
                          Normal
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <Link
                        to={`/history/${run.id}`}
                        className="text-blue-400 hover:text-blue-300 font-medium"
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
    </div>
  )
}

export default History
