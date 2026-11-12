
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Play,
  Loader2,
  BrainCircuit,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  Scatter,
} from 'recharts'
import api from '../api/axios'
import { getModels } from '../api/models'

function Detection() {
  const location = useLocation()

  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(
    location.state?.modelId || ''
  )

  const [observations, setObservations] = useState(
    JSON.stringify(
      [
        {
          timestamp: '2026-10-29T10:00:00Z',
          value: 100.5,
        },
        {
          timestamp: '2026-10-29T10:05:00Z',
          value: 105.2,
        },
      ],
      null,
      2
    )
  )

  const [loadingModels, setLoadingModels] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  // Fetch available trained models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await getModels()
        setModels(data.models || [])
      } catch {
        setError('Unable to load trained models. Check your backend.')
      } finally {
        setLoadingModels(false)
      }
    }

    fetchModels()
  }, [])

  // Run anomaly detection
  const handleDetection = async (e) => {
    e.preventDefault()

    setError('')
    setResult(null)

    if (!selectedModel) {
      setError('Please select a trained model.')
      return
    }

    let parsedObservations

    try {
      parsedObservations = JSON.parse(observations)
    } catch {
      setError('Invalid JSON. Please check your observations.')
      return
    }

    if (!Array.isArray(parsedObservations) || parsedObservations.length === 0) {
      setError('Observations must be a non-empty JSON array.')
      return
    }

    setRunning(true)

    try {
      const response = await api.post('/detections/run', {
        model_id: selectedModel,
        observations: parsedObservations,
      })

      setResult(response.data)
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'Prediction failed. Please check your backend.'
      )
    } finally {
      setRunning(false)
    }
  }

  const anomalyPercentage = result?.count
    ? ((result.anomaly_count / result.count) * 100).toFixed(1)
    : '0.0'

    const chartData = result?.predictions.map((prediction) => ({
    timestamp: prediction.timestamp,
    value: prediction.value,
    anomalyValue: prediction.anomaly
    ? prediction.value
    : null,
    }))

  return (
    <div className="w-full min-w-0 space-y-8">

      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Anomaly Detection
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Run your trained Isolation Forest models against new observations.
        </p>
      </div>

      {/* Detection form */}
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">

        {/* Model selection */}
        <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/70 p-6">

          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-cyan-500/10 p-3">
              <BrainCircuit className="text-cyan-400" size={22} />
            </div>

            <div>
              <h2 className="font-semibold text-white">
                Model Configuration
              </h2>
              <p className="text-xs text-slate-500">
                Select a trained model
              </p>
            </div>
          </div>

          <label className="mb-2 block text-sm font-medium text-slate-300">
            Trained Model
          </label>

          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={loadingModels}
            className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-cyan-400"
          >
            <option value="">
              {loadingModels ? 'Loading models...' : 'Select a model'}
            </option>

            {models.map((model) => (
              <option key={model.model_id} value={model.model_id}>
                {model.model_id}
              </option>
            ))}
          </select>

          <p className="mt-2 text-xs text-slate-500">
            {loadingModels
              ? 'Connecting to backend...'
              : `${models.length} trained models available`}
          </p>

          {selectedModel && (
            <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs text-slate-500">
                Selected Model ID
              </p>
              <p className="mt-2 break-all text-sm text-cyan-400">
                {selectedModel}
              </p>
            </div>
          )}
        </div>

        {/* Observation input */}
        <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/70 p-6">

          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-3">
              <Activity className="text-purple-400" size={22} />
            </div>

            <div>
              <h2 className="font-semibold text-white">
                Observation Data
              </h2>
              <p className="text-xs text-slate-500">
                Enter time-series observations as JSON
              </p>
            </div>
          </div>

          <label className="mb-2 block text-sm font-medium text-slate-300">
            Observations
          </label>

          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={9}
            spellCheck={false}
            className="w-full min-w-0 resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-6 text-cyan-300 outline-none focus:border-cyan-400"
          />

          <p className="mt-2 text-xs text-slate-500">
            Each observation needs a timestamp and a numeric value.
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertTriangle size={19} className="shrink-0" />
          <p className="wrap-break-word">{error}</p>
        </div>
      )}

      {/* Run button */}
      <button
        onClick={handleDetection}
        disabled={running || loadingModels}
        className="flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Running Detection...
          </>
        ) : (
          <>
            <Play size={18} />
            Run Anomaly Detection
          </>
        )}
      </button>

      {/* Prediction results */}
      {result && (
        <div className="space-y-6">

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">
                Prediction Results
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Results returned by the actual ML prediction engine.
              </p>
            </div>

            <span className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400">
              <CheckCircle2 size={15} />
              Prediction completed
            </span>
          </div>

          {/* Result statistics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-sm text-slate-400">
                Total Observations
              </p>
              <h3 className="mt-3 text-2xl font-bold text-white">
                {result.count}
              </h3>
            </div>

            <div className="rounded-xl border border-orange-500/20 bg-slate-900/70 p-5">
              <p className="text-sm text-slate-400">
                Anomalies Detected
              </p>
              <h3 className="mt-3 text-2xl font-bold text-orange-400">
                {result.anomaly_count}
              </h3>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-sm text-slate-400">
                Anomaly Percentage
              </p>
              <h3 className="mt-3 text-2xl font-bold text-cyan-400">
                {anomalyPercentage}%
              </h3>
            </div>
          </div>

{/* Prediction visualization */}
<div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">

  <div className="mb-6">
    <h3 className="text-lg font-semibold text-white">
      Anomaly Visualization
    </h3>
    <p className="mt-1 text-sm text-slate-500">
      Actual observations and detected anomalies over time
    </p>
  </div>

  <div className="h-80 w-full min-w-0">
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={chartData}
        margin={{ top: 10, right: 15, left: 0, bottom: 5 }}
      >
        <CartesianGrid
          stroke="#1e293b"
          strokeDasharray="3 3"
        />

        <XAxis
          dataKey="timestamp"
          stroke="#64748b"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(value) =>
            new Date(value).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          }
        />

        <YAxis
          stroke="#64748b"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12 }}
          width={55}
        />

        <Tooltip
          labelFormatter={(value) =>
            new Date(value).toLocaleString()
          }
          contentStyle={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#fff',
          }}
        />

        <Legend />

        <Line
          type="monotone"
          dataKey="value"
          name="Observations"
          stroke="#22d3ee"
          strokeWidth={2}
          dot={{ r: 3, fill: '#22d3ee' }}
          activeDot={{ r: 6 }}
        />

        <Scatter
          dataKey="anomalyValue"
          name="Detected anomalies"
          fill="#f97316"
          shape="circle"
        />

      </ComposedChart>
    </ResponsiveContainer>
  </div>
</div>

          {/* Prediction table */}
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">

            <div className="border-b border-slate-800 p-5">
              <h3 className="font-semibold text-white">
                Observation-level Predictions
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-162.5 text-left text-sm">
                <thead className="bg-slate-950 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Timestamp</th>
                    <th className="px-5 py-4">Value</th>
                    <th className="px-5 py-4">Anomaly Score</th>
                    <th className="px-5 py-4">Decision</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800">
                  {result.predictions.map((prediction, index) => (
                    <tr key={`${prediction.timestamp}-${index}`}>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-400">
                        {prediction.timestamp}
                      </td>

                      <td className="px-5 py-4 font-medium text-white">
                        {prediction.value}
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        {prediction.anomaly_score.toFixed(6)}
                      </td>

                      <td className="px-5 py-4">
                        {prediction.anomaly ? (
                          <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
                            Anomaly
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
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

          <p className="text-xs leading-relaxed text-slate-500">
            {result.score_semantics}
          </p>
        </div>
      )}
    </div>
  )
}

export default Detection
