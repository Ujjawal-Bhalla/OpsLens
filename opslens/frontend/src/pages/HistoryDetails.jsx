
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Activity,

} from 'lucide-react'

import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  Scatter,
} from 'recharts'

import { getDetectionDetails } from '../api/history'

function HistoryDetails() {
  const { runId } = useParams()

  const [run, setRun] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true)
        setError('')

        const data = await getDetectionDetails(runId)

        setRun(data.run)
        setPredictions(data.predictions || [])
      } catch (err) {
        console.error('Detection details error:', err)
        setError(
          err.response?.data?.detail ||
          'Unable to load detection details.'
        )
      } finally {
        setLoading(false)
      }
    }

    fetchDetails()
  }, [runId])

  const formatDate = (date) => {
    if (!date) return 'N/A'

    const normalized = date.includes('T')
      ? date
      : `${date.replace(' ', 'T')}Z`

    return new Date(normalized).toLocaleString()
  }

  const chartData = predictions.map((prediction, index) => ({
    ...prediction,
    index: index + 1,
    anomalyValue: prediction.anomaly
      ? prediction.value
      : null,
  }))

  const renderAnomalyMarker = (props) => {
    const { cx, cy } = props
    if (cx == null || isNaN(cx) || cy == null || isNaN(cy)) return null
    return (
      <g key={`anomaly-point-${cx}-${cy}`}>
        <circle cx={cx} cy={cy} r={10} fill="#ef4444" fillOpacity={0.35} />
        <circle
          cx={cx}
          cy={cy}
          r={6}
          fill="#f97316"
          stroke="#ffffff"
          strokeWidth={2}
        />
        <circle cx={cx} cy={cy} r={2.5} fill="#ffffff" />
      </g>
    )
  }

  const anomalyCount = predictions.filter(
    (prediction) => prediction.anomaly
  ).length

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        Loading detection details...
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="space-y-4">
        <Link
          to="/history"
          className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300"
        >
          <ArrowLeft size={17} />
          Back to History
        </Link>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <p className="text-red-400">
            {error || 'Detection record not found.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link
          to="/history"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition"
        >
          <ArrowLeft size={17} />
          Back to Detection History
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">
              Detection History / Run #{run.id}
            </p>

            <h1 className="text-2xl font-bold text-white mt-1">
              Detection Run #{run.id}
            </h1>

            <p className="text-sm text-slate-400 mt-1">
              {formatDate(run.created_at)}
            </p>
          </div>

          {anomalyCount > 0 ? (
            <span className="w-fit px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-sm font-medium">
              <AlertTriangle size={16} className="inline mr-2" />
              Anomalies Found
            </span>
          ) : (
            <span className="w-fit px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium">
              <CheckCircle2 size={16} className="inline mr-2" />
              Normal
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400">Observations</p>
            <Activity className="text-blue-400" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-white mt-3">
            {run.observation_count}
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400">Anomalies</p>
            <AlertTriangle className="text-amber-400" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-white mt-3">
            {anomalyCount}
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400">Normal Observations</p>
            <CheckCircle2 className="text-emerald-400" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-white mt-3">
            {predictions.length - anomalyCount}
          </h2>
        </div>
      </div>

      {/* Model Information */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">
          Model Information
        </h2>

        <div>
          <p className="text-xs text-slate-500 mb-1">Model ID</p>
          <p className="text-sm text-slate-300 break-all">
            {run.model_id}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-1">Source Dataset</p>
          <p className="text-sm text-slate-300 break-all">
            {run.source_file || 'Not available'}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-1">Score Semantics</p>
          <p className="text-sm text-slate-300">
            {run.score_semantics || 'Not available'}
          </p>
        </div>
      </div>

      {/* Prediction Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white">
          Prediction Timeline
        </h2>

        <p className="text-sm text-slate-400 mt-1 mb-6">
          Metric values across the detection run. Highlighted points indicate anomalies.
        </p>

        {chartData.length === 0 ? (
          <p className="text-slate-400 text-center py-10">
            No predictions available.
          </p>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                />

                <XAxis
                  dataKey="index"
                  stroke="#94a3b8"
                  tickFormatter={(value) => `#${value}`}
                  label={{
                    value: 'Observation',
                    position: 'insideBottom',
                    offset: -5,
                    fill: '#94a3b8',
                  }}
                />

                <YAxis stroke="#94a3b8" />

                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  formatter={(value, name, item) => {
                    if (name === 'Anomaly') {
                      const sev = item?.payload?.severity
                      return [
                        `${value}${sev ? ` (${sev.toUpperCase()} SEVERITY)` : ''}`,
                        'Anomaly Detected',
                      ]
                    }
                    return [value ?? 'N/A', name]
                  }}
                  labelFormatter={(label) => `Observation #${label}`}
                />

                <Line
                  type="monotone"
                  dataKey="value"
                  name="Metric Value"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: '#38bdf8', stroke: '#0f172a', strokeWidth: 2 }}
                  connectNulls
                />

                <Scatter
                  dataKey="anomalyValue"
                  name="Anomaly"
                  fill="#f97316"
                  shape={renderAnomalyMarker}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Predictions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">
            Individual Predictions
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {predictions.length} prediction records
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-950/50 text-slate-400">
              <tr>
                <th className="px-5 py-4">Timestamp</th>
                <th className="px-5 py-4">Value</th>
                <th className="px-5 py-4">Anomaly Score</th>
                <th className="px-5 py-4">Decision Function</th>
                <th className="px-5 py-4">Result</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {predictions.map((prediction, index) => (
                <tr
                  key={`${prediction.timestamp}-${index}`}
                  className="text-slate-300 hover:bg-slate-800/50"
                >
                  <td className="px-5 py-4 whitespace-nowrap">
                    {formatDate(prediction.timestamp)}
                  </td>

                  <td className="px-5 py-4">
                    {prediction.value}
                  </td>

                  <td className="px-5 py-4">
                    {prediction.anomaly_score?.toFixed(5) ?? 'N/A'}
                  </td>

                  <td className="px-5 py-4">
                    {prediction.decision_function?.toFixed(5) ?? 'N/A'}
                  </td>

                  <td className="px-5 py-4">
                    {prediction.anomaly ? (
                      <span className="text-amber-400 font-medium">
                        Anomaly
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-medium">
                        Normal
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default HistoryDetails
