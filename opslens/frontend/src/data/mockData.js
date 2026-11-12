
export const dashboardStats = [
  {
    title: 'Total Models',
    value: '60',
    change: 'Trained models',
    icon: 'brain',
  },
  {
    title: 'Anomalies Detected',
    value: '128',
    change: '+12.5% this week',
    icon: 'activity',
  },
  {
    title: 'Detection Rate',
    value: '94.2%',
    change: 'Illustrative metric',
    icon: 'target',
  },
  {
    title: 'System Status',
    value: 'Healthy',
    change: 'Demo status',
    icon: 'shield',
  },
]

export const anomalyTrend = [
  { time: '09:00', anomalies: 5, normal: 42 },
  { time: '10:00', anomalies: 8, normal: 48 },
  { time: '11:00', anomalies: 4, normal: 45 },
  { time: '12:00', anomalies: 12, normal: 51 },
  { time: '13:00', anomalies: 7, normal: 47 },
  { time: '14:00', anomalies: 15, normal: 52 },
  { time: '15:00', anomalies: 9, normal: 49 },
  { time: '16:00', anomalies: 6, normal: 55 },
  { time: '17:00', anomalies: 11, normal: 50 },
]

export const recentAlerts = [
  {
    id: 1,
    metric: 'API Dependency Latency',
    source: 'outbound-01.csv',
    time: '10:42 AM',
    severity: 'High',
    value: '250 ms',
  },
  {
    id: 2,
    metric: 'Application Crash Rate',
    source: 'app1-02.csv',
    time: '09:35 AM',
    severity: 'Medium',
    value: '8.4%',
  },
  {
    id: 3,
    metric: 'MongoDB Application RPS',
    source: 'mongo-03.csv',
    time: '08:50 AM',
    severity: 'Low',
    value: '42 req/s',
  },
]
