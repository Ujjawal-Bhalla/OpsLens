
import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  BrainCircuit,
  Database,
  ChevronRight,
  Activity,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getModels } from '../api/models'

function Models() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [models, setModels] = useState([])
  const [summary, setSummary] = useState({
    total_models: 0,
    discovered_csv_files: 0,
    skipped_files: 0,
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Fetch live model inventory from FastAPI
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true)
        setError('')

        const data = await getModels()

        setModels(data.models || [])
        setSummary({
          total_models: data.total_models ?? 0,
          discovered_csv_files: data.discovered_csv_files ?? 0,
          skipped_files: data.skipped_files ?? 0,
        })
      } catch (err) {
        console.error('Models API error:', err)

        setError(
          err.response?.data?.detail ||
          err.message ||
          'Unable to load models from the backend.'
        )
      } finally {
        setLoading(false)
      }
    }

    fetchModels()
  }, [])

  // Search models
  const filteredModels = useMemo(() => {
    const query = search.toLowerCase().trim()

    if (!query) return models

    return models.filter((model) =>
      (model.model_id || '').toLowerCase().includes(query) ||
      (model.source_file || '').toLowerCase().includes(query)
    )
  }, [models, search])

  const formatPercent = (value) => {
    if (value === null || value === undefined) return 'N/A'
    return `${(value * 100).toFixed(1)}%`
  }

  return (
    <div className="w-full min-w-0 space-y-8">

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Model Explorer
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Explore and inspect your trained anomaly detection models.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Total Models</p>
            <BrainCircuit className="text-cyan-400" size={21} />
          </div>

          <h2 className="mt-4 text-3xl font-bold text-white">
            {loading ? '...' : summary.total_models}
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Trained models
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Source Files</p>
            <Database className="text-cyan-400" size={21} />
          </div>

          <h2 className="mt-4 text-3xl font-bold text-white">
            {loading ? '...' : summary.discovered_csv_files}
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            CSV files discovered
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Skipped Files</p>
            <Activity className="text-emerald-400" size={21} />
          </div>

          <h2 className="mt-4 text-3xl font-bold text-white">
            {loading ? '...' : summary.skipped_files}
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Files not processed
          </p>
        </div>

      </div>

      {/* Search */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

        <div>
          <h2 className="text-lg font-semibold text-white">
            Trained Models
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Showing {filteredModels.length} of {models.length} models
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 sm:w-80">
          <Search size={18} className="shrink-0 text-slate-500" />

          <input
            type="text"
            placeholder="Search model or source file..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        </div>

      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-12 text-slate-400">
          <Loader2 size={20} className="animate-spin text-cyan-400" />
          Loading trained models...
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-400">
          <AlertTriangle size={20} className="shrink-0" />
          <div>
            <p className="font-medium">Unable to load models</p>
            <p className="mt-1 wrap-break-word">{error}</p>
          </div>
        </div>
      )}

      {/* Model table */}
      {!loading && !error && (
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">

          <div className="overflow-x-auto">
            <table className="w-full min-w-225 text-left text-sm">

              <thead className="border-b border-slate-800 bg-slate-900">
                <tr className="text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4">Model</th>
                  <th className="px-6 py-4">Source File</th>
                  <th className="px-6 py-4">Train Rows</th>
                  <th className="px-6 py-4">Test Rows</th>
                  <th className="px-6 py-4">Precision</th>
                  <th className="px-6 py-4">Recall</th>
                  <th className="px-6 py-4">F1 Score</th>
                  <th className="px-6 py-4">Details</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">

                {filteredModels.map((model) => {
                  const evaluation = model.evaluation || {}

                  return (
                    <tr
                      key={model.model_id}
                      onClick={() =>
                        navigate(`/models/${encodeURIComponent(model.model_id)}`)
                      }
                      className="cursor-pointer transition hover:bg-slate-800/50"
                    >
                      <td className="px-6 py-5">
                        <div
                          className="max-w-52 truncate font-medium text-white"
                          title={model.model_id}
                        >
                          {model.model_id}
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <div
                          className="max-w-48 truncate text-slate-400"
                          title={model.source_file}
                        >
                          {model.source_file?.split('/').pop() || 'N/A'}
                        </div>
                      </td>

                      <td className="px-6 py-5 text-slate-300">
                        {model.train_rows?.toLocaleString() ?? 'N/A'}
                      </td>

                      <td className="px-6 py-5 text-slate-300">
                        {model.test_rows?.toLocaleString() ?? 'N/A'}
                      </td>

                      <td className="px-6 py-5 text-cyan-400">
                        {formatPercent(evaluation.precision)}
                      </td>

                      <td className="px-6 py-5 text-cyan-400">
                        {formatPercent(evaluation.recall)}
                      </td>

                      <td className="px-6 py-5">
                        <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-200">
                          {formatPercent(evaluation.f1)}
                        </span>
                      </td>

                      <td className="px-6 py-5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/models/${encodeURIComponent(model.model_id)}`)
                          }}
                          title="View model details"
                          className="text-slate-400 hover:text-cyan-400"
                        >
                          <ChevronRight size={19} />
                        </button>
                      </td>
                    </tr>
                  )
                })}

                {filteredModels.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-500">
                      No matching models found.
                    </td>
                  </tr>
                )}

              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Evaluation metrics are taken from the training manifest.
        Models with single-class holdout labels require cautious interpretation.
      </p>

    </div>
  )
}

export default Models
