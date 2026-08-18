import { useEffect } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { seedIfEmpty } from '../data/db'
import { CheckinScreen } from '../features/checkin/CheckinScreen'
import { DashboardScreen } from '../features/dashboard/DashboardScreen'
import { ExportScreen } from '../features/export/ExportScreen'
import { HistoryScreen } from '../features/history/HistoryScreen'
import { ImportScreen } from '../features/importing/ImportScreen'
import { InsightsScreen } from '../features/insights/InsightsScreen'
import { LabDetailScreen, LabsScreen } from '../features/labs/LabsScreen'
import { MeasurementsScreen } from '../features/measurements/MeasurementsScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { MoreScreen } from './MoreScreen'

const NAV = [
  { to: '/dzień', label: 'Dziś', icon: '◉' },
  { to: '/trendy', label: 'Trendy', icon: '◔' },
  { to: '/zależności', label: 'Zależności', icon: '≈' },
  { to: '/badania', label: 'Badania', icon: '✚' },
  { to: '/więcej', label: 'Więcej', icon: '⋯' },
]

export default function App() {
  useEffect(() => {
    void seedIfEmpty()
    // trwałość danych: prosba o pamiec nieusuwalna automatycznie przez przeglądarkę
    void navigator.storage?.persist?.()
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dzień" replace />} />
        <Route path="/dzień" element={<CheckinScreen />} />
        <Route path="/dzień/:date" element={<CheckinScreen />} />
        <Route path="/historia" element={<HistoryScreen />} />
        <Route path="/trendy" element={<DashboardScreen />} />
        <Route path="/zależności" element={<InsightsScreen />} />
        <Route path="/badania" element={<LabsScreen />} />
        <Route path="/badania/:testKey" element={<LabDetailScreen />} />
        <Route path="/pomiary" element={<MeasurementsScreen />} />
        <Route path="/import" element={<ImportScreen />} />
        <Route path="/eksport" element={<ExportScreen />} />
        <Route path="/ustawienia" element={<SettingsScreen />} />
        <Route path="/więcej" element={<MoreScreen />} />
        <Route path="*" element={<Navigate to="/dzień" replace />} />
      </Routes>
      <BottomNav />
    </HashRouter>
  )
}

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-line)] bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`
            }
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
