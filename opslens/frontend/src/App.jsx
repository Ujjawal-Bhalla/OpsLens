
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import History from './pages/History'
import HistoryDetails from './pages/HistoryDetails'
import Dashboard from './pages/Dashboard'
import Models from './pages/Models'
import Detection from './pages/Detection'
import Analytics from './pages/Analytics'
import ModelDetails from './pages/ModelDetails'

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/models" element={<Models />} />
          <Route path="/detection" element={<Detection />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/models/:modelId" element={<ModelDetails />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:runId" element={<HistoryDetails />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  )
}

export default App
