import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Play,
  Loader2,
  BrainCircuit,
  Upload,
  Layers,
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

const UNIVARIATE_SAMPLE = [
  { timestamp: '2026-10-29T10:00:00Z', value: 100.5 },
  { timestamp: '2026-10-29T10:05:00Z', value: 105.2 },
  { timestamp: '2026-10-29T10:10:00Z', value: 102.1 },
  { timestamp: '2026-10-29T10:15:00Z', value: 245.0 },
  { timestamp: '2026-10-29T10:20:00Z', value: 99.8 },
]

const MULTIVARIATE_SAMPLE = [
  {
    timestamp: '2026-10-29T10:00:00Z',
    metrics: { response_time_ms: 120.0, error_rate: 0.01, cpu_percent: 35.0, rps: 250.0 },
  },
  {
    timestamp: '2026-10-29T10:05:00Z',
    metrics: { response_time_ms: 122.5, error_rate: 0.012, cpu_percent: 36.2, rps: 255.0 },
  },
  {
    timestamp: '2026-10-29T10:10:00Z',
    metrics: { response_time_ms: 119.8, error_rate: 0.009, cpu_percent: 34.8, rps: 248.0 },
  },
  {
    timestamp: '2026-10-29T10:15:00Z',
    metrics: { response_time_ms: 950.0, error_rate: 0.38, cpu_percent: 88.5, rps: 410.0 },
  },
  {
    timestamp: '2026-10-29T10:20:00Z',
    metrics: { response_time_ms: 125.0, error_rate: 0.015, cpu_percent: 38.0, rps: 260.0 },
  },
]

function Detection() {
  const location = useLocation()
  const fileInputRef = useRef(null)

  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(
    location.state?.modelId || 'isolation_forest_multivariate'
  )

  const [observations, setObservations] = useState(
    JSON.stringify(MULTIVARIATE_SAMPLE, null, 2)
  )

  const [loadingModels, setLoadingModels] = useState(true)
  const [running, setRunning] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadNote, setUploadNote] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  // Fetch available trained models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await getModels()
        const modelList = data.models || []
        setModels(modelList)
        if (!location.state?.modelId && modelList.length > 0) {
          const defaultModel = modelList.find(m => m.detection_mode === 'multivariate') || modelList[0]
          setSelectedModel(defaultModel.model_id)
        }
      } catch {
        setError('Unable to load trained models. Check your backend.')
      } finally {
        setLoadingModels(false)
      }
    }

    fetchModels()
  }, [location.state?.modelId])

  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')
    setUploadNote('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await api.post('/logs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const uploadData = response.data
      setUploadNote(
        `Loaded ${uploadData.entry_count} entries from ${uploadData.filename}. ${uploadData.ingestion_note}`
      )

      // Read raw file content to populate the textarea
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result)
          setObservations(JSON.stringify(parsed, null, 2))
          if (uploadData.metric_names?.length > 1) {
            setSelectedModel('isolation_forest_multivariate')
          }
        } catch {
          setObservations(JSON.stringify(uploadData.preview, null, 2))
        }
      }
      reader.readAsText(file)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to upload log file.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Run anomaly detection
  const handleDetection = async (e) => {
    e.preventDefault()

    setError('')
    setResult(null)

    if (!selectedModel) {
      setError('Please select a model.')
      return
    }

    let parsedObservations

    try {
      parsedObservations = JSON.parse(observations)
      if (!Array.isArray(parsedObservations) && parsedObservations?.observations) {
        parsedObservations = parsedObservations.observations
      }
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
    anomalyValue: prediction.anomaly ? prediction.value : null,
  }))

  const selectedModelObj = models.find((m) => m.model_id === selectedModel)

  return (
    <div className="w-full min-w-0 space-y-8">

      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Anomaly Detection
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Run univariate or multivariate Isolation Forest models against operational logs and metrics.
        </p>
      </div>

      {/* Detection form */}
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">

        {/* Model selection */}
        <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/70 p-6 flex flex-col justify-between">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-cyan-500/10 p-3">
                <BrainCircuit className="text-cyan-400" size={22} />
              </div>

              <div>
                <h2 className="font-semibold text-white">
                  Model Configuration
                </h2>
                <p className="text-xs text-slate-500">
                  Select a detection mode and algorithm
                </p>
              </div>
            </div>

            <label className="mb-2 block text-sm font-medium text-slate-300">
              Detection Model
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

              <optgroup label="✨ Multivariate Detection (Multiple Related Metrics)">
                {models
                  .filter((m) => m.detection_mode === 'multivariate')
                  .map((model) => (
                    <option key={model.model_id} value={model.model_id}>
                      {model.human_name || model.model_id}
                    </option>
                  ))}
              </optgroup>

              <optgroup label="Univariate Detection (Single Metric Time Series)">
                {models
                  .filter((m) => m.detection_mode !== 'multivariate')
                  .map((model) => (
                    <option key={model.model_id} value={model.model_id}>
                      {model.human_name ? `${model.human_name} (${model.use_case_tag})` : model.model_id}
                    </option>
                  ))}
              </optgroup>
            </select>

            <p className="mt-2 text-xs text-slate-500">
              {loadingModels
                ? 'Connecting to backend...'
                : `${models.length} detection models available`}
            </p>
          </div>

          {selectedModelObj && (
            <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Selected Model</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  selectedModelObj.detection_mode === 'multivariate'
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                    : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                }`}>
                  {selectedModelObj.detection_mode === 'multivariate' ? 'Multivariate' : 'Univariate'}
                </span>
              </div>
              <p className="font-medium text-sm text-white">
                {selectedModelObj.human_name || selectedModelObj.model_id}
              </p>
              {selectedModelObj.description && (
                <p className="text-xs text-slate-400">
                  {selectedModelObj.description}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Observation input */}
        <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-3">
                <Activity className="text-purple-400" size={22} />
              </div>

              <div>
                <h2 className="font-semibold text-white">
                  Observation Data
                </h2>
                <p className="text-xs text-slate-500">
                  Paste JSON logs or upload a file
                </p>
              </div>
            </div>

            {/* Ingestion & Sample buttons */}
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".json"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-700"
                title="Upload JSON log file"
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                Upload JSON
              </button>
            </div>
          </div>

          {/* Quick template toggles */}
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="text-slate-500">Samples:</span>
            <button
              type="button"
              onClick={() => {
                setObservations(JSON.stringify(MULTIVARIATE_SAMPLE, null, 2))
                setSelectedModel('isolation_forest_multivariate')
                setUploadNote('')
              }}
              className="text-cyan-400 hover:underline"
            >
              Multi-Metric Web Logs
            </button>
            <span className="text-slate-600">|</span>
            <button
              type="button"
              onClick={() => {
                setObservations(JSON.stringify(UNIVARIATE_SAMPLE, null, 2))
                setUploadNote('')
              }}
              className="text-slate-400 hover:text-white hover:underline"
            >
              Single Metric
            </button>
          </div>

          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full min-w-0 resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-5 text-cyan-300 outline-none focus:border-cyan-400"
          />

          {uploadNote && (
            <p className="mt-2 text-xs text-emerald-400">
              ✓ {uploadNote}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Accepts multivariate &#123;timestamp, metrics: &#123;...&#125;&#125; or legacy &#123;timestamp, value&#125;.
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
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">
                  Prediction Results
                </h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  result.detection_mode === 'multivariate'
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                    : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                }`}>
                  {result.detection_mode === 'multivariate' ? 'Multivariate' : 'Univariate'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Processed {result.count} observations with model &quot;{result.model_id}&quot;
              </p>
            </div>

            <span className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400">
              <CheckCircle2 size={15} />
              Prediction completed
            </span>
          </div>

          {/* Metric tags if multivariate */}
          {result.metric_names && result.metric_names.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Layers size={14} className="text-purple-400" />
                Evaluated Metrics:
              </span>
              {result.metric_names.map((m) => (
                <span
                  key={m}
                  className="rounded bg-slate-800 px-2 py-0.5 text-xs font-mono text-cyan-300"
                >
                  {m}
                </span>
              ))}
              {result.imputed_metrics?.length > 0 && (
                <span className="text-xs text-amber-400 ml-2">
                  (Imputed missing: {result.imputed_metrics.join(', ')})
                </span>
              )}
            </div>
          )}

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

          {/* Severity Breakdown Bar */}
          {result.severity_breakdown && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Calibrated Severity Breakdown
                </span>
                <span className="text-xs text-slate-500">
                  Relative anomaly distance calibration
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                  <div className="text-xs text-emerald-400 font-medium">Normal</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {result.severity_breakdown.Normal || 0}
                  </div>
                </div>
                <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
                  <div className="text-xs text-blue-400 font-medium">Low Severity</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {result.severity_breakdown.Low || 0}
                  </div>
                </div>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                  <div className="text-xs text-amber-400 font-medium">Medium</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {result.severity_breakdown.Medium || 0}
                  </div>
                </div>
                <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3">
                  <div className="text-xs text-orange-400 font-medium">High</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {result.severity_breakdown.High || 0}
                  </div>
                </div>
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <div className="text-xs text-red-400 font-medium">Critical</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {result.severity_breakdown.Critical || 0}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Prediction visualization */}
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">
                Anomaly Visualization
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Primary observation values and detected anomalies over time
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
                    name="Observation Value"
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
                    <th className="px-5 py-4">Metrics / Value</th>
                    <th className="px-5 py-4">Anomaly Score</th>
                    <th className="px-5 py-4">Severity</th>
                    <th className="px-5 py-4">Decision</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800">
                  {result.predictions.map((prediction, index) => {
                    const sev = prediction.severity || (prediction.anomaly ? 'Medium' : 'Normal')
                    const sevColors = {
                      Normal: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                      Low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                      Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                      High: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
                      Critical: 'bg-red-500/10 text-red-400 border-red-500/30 font-semibold',
                    }

                    return (
                      <tr key={`${prediction.timestamp}-${index}`} className="hover:bg-slate-800/30">
                        <td className="whitespace-nowrap px-5 py-4 text-slate-400 font-mono text-xs">
                          {prediction.timestamp}
                        </td>

                        <td className="px-5 py-4">
                          {prediction.metrics && Object.keys(prediction.metrics).length > 1 ? (
                            <div className="space-y-1">
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(prediction.metrics).map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="inline-flex items-center rounded bg-slate-800/80 px-2 py-0.5 text-xs text-slate-200"
                                  >
                                    <span className="text-slate-500 mr-1">{k}:</span>
                                    {typeof v === 'number' ? v.toFixed(2) : v}
                                  </span>
                                ))}
                              </div>
                              {prediction.contributing_metrics && prediction.contributing_metrics.length > 0 && (
                                <div className="text-[11px] text-amber-400/90 flex items-center gap-1 mt-1">
                                  <span>Top contributor:</span>
                                  <span className="font-semibold text-white">
                                    {prediction.contributing_metrics[0].metric} ({prediction.contributing_metrics[0].contribution_pct}%, z={prediction.contributing_metrics[0].deviation_zscore})
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="font-medium text-white">
                              {prediction.value}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-slate-300 font-mono text-xs">
                          {prediction.anomaly_score.toFixed(6)}
                        </td>

                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${sevColors[sev] || sevColors.Normal}`}>
                            {sev}
                          </span>
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-xs space-y-1 text-slate-500">
            <p>{result.score_semantics}</p>
            {result.explanation_method && (
              <p className="text-slate-500 italic">
                * Explainability method: {result.explanation_method}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Detection
