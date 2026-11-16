import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  BrainCircuit,
  Database,
  ChevronRight,
  Activity,
  Loader2,
  AlertTriangle,
  Play,
  ArrowUpDown,
  Sparkles,
  Layers,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getModels } from '../api/models'

const USE_CASE_CATEGORIES = [
  { id: 'all', label: 'All Work Cases' },
  { id: 'multivariate', label: '✨ Multivariate / Webapp' },
  { id: 'latency', label: 'API Latency' },
  { id: 'traffic', label: 'Traffic & RPS' },
  { id: 'crash_detection', label: 'Crash Detection' },
  { id: 'business_metrics', label: 'Business / Purchase' },
  { id: 'data_pipeline', label: 'Data Ingress' },
  { id: 'availability', label: 'Availability' },
]

const SORT_OPTIONS = [
  { id: 'f1_desc', label: 'F1 Score (Highest First)' },
  { id: 'precision_desc', label: 'Precision (Highest First)' },
  { id: 'recall_desc', label: 'Recall (Highest First)' },
  { id: 'rows_desc', label: 'Training Size (Largest First)' },
  { id: 'name_asc', label: 'Model Name (A-Z)' },
]

function Models() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedMode, setSelectedMode] = useState('all') // 'all' | 'multivariate' | 'univariate'
  const [sortBy, setSortBy] = useState('f1_desc')
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

  // Find top F1 score model per category for "Recommended" badges
  const topModelIds = useMemo(() => {
    const tops = new Set()
    const categories = new Set(models.map((m) => m.use_case_tag || 'general'))
    for (const cat of categories) {
      const inCat = models.filter((m) => (m.use_case_tag || 'general') === cat)
      if (inCat.length > 0) {
        const sorted = [...inCat].sort(
          (a, b) => (b.evaluation?.f1 || 0) - (a.evaluation?.f1 || 0)
        )
        if ((sorted[0].evaluation?.f1 || 0) > 0) {
          tops.add(sorted[0].model_id)
        }
      }
    }
    return tops
  }, [models])

  // Filter and sort models
  const processedModels = useMemo(() => {
    const query = search.toLowerCase().trim()

    let result = models.filter((model) => {
      // 1. Search text match
      const name = (model.human_name || '').toLowerCase()
      const modelId = (model.model_id || '').toLowerCase()
      const source = (model.source_file || '').toLowerCase()
      const matchesSearch = !query || name.includes(query) || modelId.includes(query) || source.includes(query)

      // 2. Work case / Category filter
      const matchesCategory =
        selectedCategory === 'all' ||
        model.use_case_tag === selectedCategory

      // 3. Detection mode filter
      const matchesMode =
        selectedMode === 'all' ||
        (selectedMode === 'multivariate' && model.detection_mode === 'multivariate') ||
        (selectedMode === 'univariate' && model.detection_mode !== 'multivariate')

      return matchesSearch && matchesCategory && matchesMode
    })

    // Sort
    return result.sort((a, b) => {
      const aEval = a.evaluation || {}
      const bEval = b.evaluation || {}

      switch (sortBy) {
        case 'f1_desc':
          return (bEval.f1 || 0) - (aEval.f1 || 0)
        case 'precision_desc':
          return (bEval.precision || 0) - (aEval.precision || 0)
        case 'recall_desc':
          return (bEval.recall || 0) - (aEval.recall || 0)
        case 'rows_desc':
          return (b.train_rows || 0) - (a.train_rows || 0)
        case 'name_asc':
          return (a.human_name || a.model_id).localeCompare(b.human_name || b.model_id)
        default:
          return 0
      }
    })
  }, [models, search, selectedCategory, selectedMode, sortBy])

  const formatPercent = (value) => {
    if (value === null || value === undefined) return 'N/A'
    return `${(value * 100).toFixed(1)}%`
  }

  const getTagColor = (tag) => {
    switch (tag) {
      case 'multivariate':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
      case 'latency':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      case 'traffic':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
      case 'crash_detection':
        return 'bg-red-500/10 text-red-400 border-red-500/20'
      case 'business_metrics':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      case 'data_pipeline':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      case 'availability':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700'
    }
  }

  return (
    <div className="w-full min-w-0 space-y-8">

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Model Explorer
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Discover, filter by work case, and select models based on performance.
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
            Trained and operational models
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
            CSV series discovered
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Multivariate &amp; Univariate</p>
            <Activity className="text-emerald-400" size={21} />
          </div>

          <h2 className="mt-4 text-3xl font-bold text-white">
            {loading ? '...' : models.filter(m => m.detection_mode === 'multivariate').length} Multi / {models.filter(m => m.detection_mode !== 'multivariate').length} Uni
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Flexible detection modes
          </p>
        </div>

      </div>

      {/* Work Case Filter Chips */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Filter by Work Case:
          </span>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Mode:</span>
            <button
              onClick={() => setSelectedMode('all')}
              className={`rounded px-2 py-1 ${selectedMode === 'all' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
            >
              All Modes
            </button>
            <button
              onClick={() => setSelectedMode('multivariate')}
              className={`rounded px-2 py-1 ${selectedMode === 'multivariate' ? 'bg-purple-500 text-white font-semibold' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
            >
              Multivariate
            </button>
            <button
              onClick={() => setSelectedMode('univariate')}
              className={`rounded px-2 py-1 ${selectedMode === 'univariate' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
            >
              Univariate
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {USE_CASE_CATEGORIES.map((cat) => {
            const count = cat.id === 'all'
              ? models.length
              : models.filter((m) => m.use_case_tag === cat.id).length

            const isActive = selectedCategory === cat.id

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? 'border-cyan-400 bg-cyan-500/10 text-cyan-400 shadow-sm shadow-cyan-500/20'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-white'
                }`}
              >
                {cat.label}
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  isActive ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Search and Sort controls */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

        <div>
          <h2 className="text-lg font-semibold text-white">
            Available Models
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Showing {processedModels.length} of {models.length} models
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search box */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 sm:w-64">
            <Search size={16} className="shrink-0 text-slate-500" />
            <input
              type="text"
              placeholder="Search name, use case, file..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
            />
          </div>

          {/* Sort dropdown */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
            <ArrowUpDown size={15} className="text-cyan-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-xs text-white outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-slate-900 text-white">
                  Sort: {opt.label}
                </option>
              ))}
            </select>
          </div>
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

              <thead className="border-b border-slate-800 bg-slate-950 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4">Model &amp; Work Case</th>
                  <th className="px-6 py-4">Mode</th>
                  <th className="px-6 py-4">Train Rows</th>
                  <th className="px-6 py-4">Precision</th>
                  <th className="px-6 py-4">Recall</th>
                  <th className="px-6 py-4">F1 Score</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">

                {processedModels.map((model) => {
                  const evaluation = model.evaluation || {}
                  const isTop = topModelIds.has(model.model_id)
                  const isMulti = model.detection_mode === 'multivariate'

                  return (
                    <tr
                      key={model.model_id}
                      onClick={() =>
                        navigate(`/models/${encodeURIComponent(model.model_id)}`)
                      }
                      className="cursor-pointer transition hover:bg-slate-800/40"
                    >
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">
                              {model.human_name || model.model_id}
                            </span>
                            {isTop && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">
                                <Sparkles size={10} />
                                Top Pick
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded px-2 py-0.5 text-[11px] font-medium border ${getTagColor(model.use_case_tag)}`}>
                              {model.use_case_tag || 'general'}
                            </span>
                            <span className="text-xs text-slate-500 truncate max-w-48 font-mono">
                              {model.source_file?.split('/').pop() || model.model_id}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                          isMulti
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                            : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                        }`}>
                          {isMulti ? <Layers size={11} /> : <Activity size={11} />}
                          {isMulti ? 'Multivariate' : 'Univariate'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-slate-300 font-mono text-xs">
                        {model.train_rows?.toLocaleString() ?? 'Dynamic'}
                      </td>

                      <td className="px-6 py-4 text-cyan-400 font-medium">
                        {formatPercent(evaluation.precision)}
                      </td>

                      <td className="px-6 py-4 text-cyan-400 font-medium">
                        {formatPercent(evaluation.recall)}
                      </td>

                      <td className="px-6 py-4">
                        <span className={`rounded-md px-2 py-1 text-xs font-bold ${
                          (evaluation.f1 || 0) >= 0.7
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : (evaluation.f1 || 0) >= 0.4
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {formatPercent(evaluation.f1)}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate('/detection', { state: { modelId: model.model_id } })
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 px-3 py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 transition"
                            title="Run detection using this model"
                          >
                            <Play size={12} />
                            Use Model
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/models/${encodeURIComponent(model.model_id)}`)
                            }}
                            title="View model details"
                            className="p-1.5 text-slate-400 hover:text-white"
                          >
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {processedModels.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-500">
                      No matching models found for this work case or search filter.
                    </td>
                  </tr>
                )}

              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Evaluation metrics are calculated against chronological holdout sets. Top picks represent highest F1 performance per category.
      </p>

    </div>
  )
}

export default Models
