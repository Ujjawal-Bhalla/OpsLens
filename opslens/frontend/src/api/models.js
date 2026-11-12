
import api from './axios'

export const getModels = async () => {
  const response = await api.get('/models')
  return response.data
}
