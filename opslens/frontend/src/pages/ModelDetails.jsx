
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BrainCircuit,
  Database,
  FileCode,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Play,
  Loader2,
} from 'lucide-react'

import { getModels } from '../api/models'

function MetricCard({ title, value, description }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <h3 className="mt-3 text-2xl font-bold text-white">{value}</h3>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </div>
  )
}

function ModelDetails() {
  const { modelId } = useParams()
  const navigate = useNavigate()

  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Fetch model inventory from FastAPI
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true)
        setError('')

        const data = await getModels()
        setModels(data.models || [])
      } catch (err) {
        console.error('Model details API error:', err)

        setError(
          err.response?.data?.detail ||
          err.message ||
          'Unable to load model information.'
        )
      } finally {
        setLoading(false)
      }
    }

    fetchModels()
  }, [])

  // Find the requested model
  const model = models.find(
    (item) => item.model_id === modelId
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-12 text-slate-400">
        <Loader2 size={20} className="animate-spin text-cyan-400" />
        Loading model details...
      </div>
    )
  }

  if (error || !model) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/models')}
          className="flex items-center gap-2 text-sm text-cyan-400"
        >
          <ArrowLeft size={17} />
          Back to Models
        </button>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
          <AlertTriangle className="mx-auto text-orange-400" size={32} />

          <h2 className="mt-4 text-xl font-semibold text-white">
            {error ? 'Unable to load model' : 'Model not found'}
          </h2>

          <p className="mt-2 wrap-break-word text-sm text-slate-400">
            {error || 'The requested model does not exist in the current manifest.'}
          </p>
        </div>
      </div>
    )
  }

  const evaluation = model.evaluation || {}
  const confusion = evaluation.confusion_matrix_tn_fp_fn_tp

  const formatPercent = (value) =>
    value === null || value === undefined
      ? 'N/A'
      : `${(value * 100).toFixed(2)}%`

  const metrics = [
    {
      title: 'Precision',
      value: formatPercent(evaluation.precision),
      description: 'Correct predictions among flagged anomalies',
    },
    {
      title: 'Recall',
      value: formatPercent(evaluation.recall),
      description: 'Actual anomalies successfully detected',
    },
    {
      title: 'F1 Score',
      value: formatPercent(evaluation.f1),
      description: 'Balance between precision and recall',
    },
  ]

  return (
    <div className="w-full min-w-0 space-y-8">

      {/* Back navigation */}
      <button
        onClick={() => navigate('/models')}
        className="flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-400"
      >
        <ArrowLeft size={17} />
        Back to Models
      </button>

      {/* Model heading */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-xl bg-cyan-500/10 p-3">
              <BrainCircuit className="text-cyan-400" size={25} />
            </div>

            <div className="min-w-0">
              <p className="text-sm text-slate-500">Model Details</p>
              <h1 className="wrap-break-word text-xl font-bold text-white">
                {model.human_name || model.source_file?.split('/').pop() || model.model_id}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                  model.detection_mode === 'multivariate'
                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                    : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                }`}>
                  {model.detection_mode === 'multivariate' ? 'Multivariate' : 'Univariate'}
                </span>
                <span className="rounded bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300 border border-slate-700">
                  Category: {model.use_case_tag || 'general'}
                </span>
                <span className="rounded bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300 border border-slate-700">
                  Contamination: {model.contamination ?? 0.05}
                </span>
              </div>
              {model.description && (
                <p className="mt-3 text-sm text-slate-300">
                  {model.description}
                </p>
              )}
            </div>
          </div>

          <p className="mt-4 break-all text-sm text-slate-400">
            {model.model_id}
          </p>
        </div>

        <button
          onClick={() => navigate('/detection', {
            state: { modelId: model.model_id }
          })}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          <Play size={17} />
          Use this model
        </button>
      </div>

      {/* Evaluation warning */}
      {evaluation.note && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={20} />
          <div>
            <p className="font-medium text-amber-400">
              Evaluation caution
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {evaluation.note}
            </p>
          </div>
        </div>
      )}

      {/* Evaluation metrics */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">
          Evaluation Performance
        </h2>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {metrics.map((metric) => (
            <MetricCard key={metric.title} {...metric} />
          ))}
        </div>
      </section>

      {/* Dataset information */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">
          Dataset Information
        </h2>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Total Records"
            value={model.rows?.toLocaleString() ?? 'N/A'}
            description="Total dataset observations"
          />

          <MetricCard
            title="Training Records"
            value={model.train_rows?.toLocaleString() ?? 'N/A'}
            description="Records used during training"
          />

          <MetricCard
            title="Testing Records"
            value={model.test_rows?.toLocaleString() ?? 'N/A'}
            description="Holdout evaluation records"
          />

          <MetricCard
            title="Evaluated Records"
            value={evaluation.evaluated_rows?.toLocaleString() ?? 'N/A'}
            description="Records used for evaluation"
          />
        </div>
      </section>

      {/* Confusion matrix */}
      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-lg font-semibold text-white">
          Confusion Matrix
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Comparison of actual and predicted anomaly labels
        </p>

        {confusion ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-112.5 max-w-xl text-center">
              <thead>
                <tr className="text-xs text-slate-400">
                  <th className="p-3"></th>
                  <th className="p-3">Predicted Normal</th>
                  <th className="p-3">Predicted Anomaly</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <th className="p-3 text-left text-sm text-slate-300">
                    Actual Normal
                  </th>
                  <td className="rounded-lg bg-emerald-500/10 p-5 text-xl font-bold text-emerald-400">
                    {confusion[0][0]}
                    <p className="mt-1 text-xs font-normal">True Negative</p>
                  </td>
                  <td className="rounded-lg bg-red-500/10 p-5 text-xl font-bold text-red-400">
                    {confusion[0][1]}
                    <p className="mt-1 text-xs font-normal">False Positive</p>
                  </td>
                </tr>

                <tr>
                  <th className="p-3 text-left text-sm text-slate-300">
                    Actual Anomaly
                  </th>
                  <td className="rounded-lg bg-red-500/10 p-5 text-xl font-bold text-red-400">
                    {confusion[1][0]}
                    <p className="mt-1 text-xs font-normal">False Negative</p>
                  </td>
                  <td className="rounded-lg bg-emerald-500/10 p-5 text-xl font-bold text-emerald-400">
                    {confusion[1][1]}
                    <p className="mt-1 text-xs font-normal">True Positive</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 text-sm text-slate-500">
            Confusion matrix is unavailable for this model.
          </p>
        )}
      </section>

      {/* Artifact information */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-lg font-semibold text-white">
          Model Artifact
        </h2>

        <div className="mt-5 space-y-4">
          <div className="flex items-start gap-3">
            <Database className="mt-1 shrink-0 text-cyan-400" size={19} />
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Source Dataset</p>
              <p className="mt-1 break-all text-sm text-slate-300">
                {model.source_file}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <FileCode className="mt-1 shrink-0 text-cyan-400" size={19} />
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Artifact Path</p>
              <p className="mt-1 break-all text-sm text-slate-300">
                {model.artifact}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Activity className="mt-1 shrink-0 text-cyan-400" size={19} />
            <div>
              <p className="text-xs text-slate-500">Evaluation Status</p>
              <p className="mt-1 flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 size={15} />
                Evaluation data available
              </p>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}

export default ModelDetails
