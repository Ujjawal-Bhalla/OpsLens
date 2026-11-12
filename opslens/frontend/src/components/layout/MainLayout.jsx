
import Sidebar from './Sidebar'
import Topbar from './Topbar'

function MainLayout({ children }) {
  return (
    <div className="flex h-screen w-full max-w-full overflow-hidden bg-slate-950">

      {/* Fixed sidebar */}
      <div className="h-full w-16 shrink-0 overflow-y-auto overflow-x-hidden sm:w-64">
        <Sidebar />
      </div>

      {/* Main application area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <div className="w-full min-w-0">
            {children}
          </div>
        </main>
      </div>

    </div>
  )
}

export default MainLayout
