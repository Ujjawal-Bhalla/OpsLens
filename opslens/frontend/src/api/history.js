
import api from './axios'

export const getDetectionHistory = async (limit = 50, offset = 0) => {
  const response = await api.get('/detections/history', {
    params: { limit, offset },
  })

  return response.data
}

export const getDetectionDetails = async (runId) => {
  const response = await api.get(`/detections/history/${runId}`)

  return response.data
}
