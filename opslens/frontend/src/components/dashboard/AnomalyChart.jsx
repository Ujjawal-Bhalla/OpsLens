
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

import { anomalyTrend } from '../../data/mockData'

function AnomalyChart() {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
      <div className="mb-6 min-w-0">
        <h3 className="text-lg font-semibold text-white">
          Monitoring Activity
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Sample normal observations and detected anomalies
        </p>
      </div>

      <div className="h-72 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={anomalyTrend}
            margin={{ top: 5, right: 5, left: -15, bottom: 5 }}
          >
            <defs>
              <linearGradient id="anomalyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />

            <XAxis
              dataKey="time"
              stroke="#64748b"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
            />

            <YAxis
              stroke="#64748b"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              width={40}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#fff',
              }}
            />

            <Legend wrapperStyle={{ fontSize: '12px' }} />

            <Area
              type="monotone"
              dataKey="normal"
              name="Normal observations"
              stroke="#22d3ee"
              fill="url(#anomalyGradient)"
              strokeWidth={2}
            />

            <Area
              type="monotone"
              dataKey="anomalies"
              name="Anomalies"
              stroke="#f97316"
              fill="none"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default AnomalyChart
