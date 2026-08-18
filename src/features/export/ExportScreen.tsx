import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { getSettings, saveSettings } from '../../data/repo'
import { buildDataset, lastLabDate, type ExportDataset } from '../../reporting/dataset'
import { buildJsonExport } from '../../reporting/json'
import { buildMarkdownReport } from '../../reporting/markdown'
import { csvFiles } from '../../reporting/csv'
import { addDays, formatDatePl, today } from '../../lib/date'
import { copyToClipboard, downloadText } from '../../lib/files'
import { Button, Chip, Note, Screen, Section, Toast } from '../../components/ui'

type Preset = '7d' | '30d' | '90d' | 'since_labs' | 'custom'

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: '7d', label: 'ostatnie 7 dni' },
  { id: '30d', label: '30 dni' },
  { id: '90d', label: '90 dni' },
  { id: 'since_labs', label: 'od ostatnich badań' },
  { id: 'custom', label: 'własny zakres' },
]

export function ExportScreen() {
  const [preset, setPreset] = useState<Preset>('30d')
  const [customFrom, setCustomFrom] = useState(addDays(today(), -60))
  const [customTo, setCustomTo] = useState(today())
  const [dataset, setDataset] = useState<ExportDataset | null>(null)
  const [report, setReport] = useState<string>('')
  const [toast, setToast] = useState<string | null>(null)
  const [warningShown, setWarningShown] = useState(false)

  const settings = useLiveQuery(() => getSettings(), [])
  const labDate = useLiveQuery(() => lastLabDate(), [])
  const dailyCount = useLiveQuery(() => db.daily.count(), [])

  const range = useMemo(() => {
    const to = preset === 'custom' ? customTo : today()
    switch (preset) {
      case '7d':
        return { from: addDays(to, -6), to }
      case '30d':
        return { from: addDays(to, -29), to }
      case '90d':
        return { from: addDays(to, -89), to }
      case 'since_labs':
        return { from: labDate ?? addDays(to, -89), to }
      case 'custom':
        return { from: customFrom, to }
    }
  }, [preset, customFrom, customTo, labDate])

  useEffect(() => {
    let active = true
    void (async () => {
      const d = await buildDataset(range.from, range.to)
      if (!active) return
      setDataset(d)
      setReport(buildMarkdownReport(d))
    })()
    return () => {
      active = false
    }
  }, [range.from, range.to, dailyCount])

  const fileBase = `health_${range.from}_${range.to}`

  async function copyReport() {
    if (!settings?.aiExportWarningDismissed && !warningShown) {
      setWarningShown(true)
      setToast('Uwaga: wklejenie raportu do zewnętrznej usługi AI przekazuje jej te dane. Dotknij ponownie, aby skopiowac.')
      window.setTimeout(() => setToast(null), 5000)
      return
    }
    const ok = await copyToClipboard(report)
    setToast(ok ? 'Raport skopiowany do schowka.' : 'Nie udało się skopiowac - uzyj pobrania pliku.')
    window.setTimeout(() => setToast(null), 2600)
  }

  return (
    <Screen title="Eksport do analizy AI" subtitle="Raport i dane w formatach gotowych do wklejenia lub załączenia">
      <Section title="Zakres">
        <div className="mb-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Chip key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--color-muted)]">od</label>
              <input className="field tabular-nums" type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-muted)]">do</label>
              <input className="field tabular-nums" type="date" value={customTo} max={today()} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </div>
        )}
        <Note>
          {formatDatePl(range.from)} - {formatDatePl(range.to)} · dni z wpisami: {dataset?.entries.length ?? 0} · wyników badań w okresie: {dataset?.labResults.length ?? 0}
          {preset === 'since_labs' && !labDate ? ' · brak zapisanych badań, uzyto ostatnich 90 dni' : ''}
        </Note>
      </Section>

      <Section title="Raport Markdown" hint="Zoptymalizowany do wklejenia w ChatGPT lub Claude.">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void copyReport()}>
            Kopiuj raport
          </Button>
          <Button onClick={() => downloadText(`${fileBase}_raport.md`, report, 'text/markdown;charset=utf-8')}>Pobierz .md</Button>
          {!settings?.aiExportWarningDismissed && (
            <Button variant="ghost" onClick={() => void saveSettings({ aiExportWarningDismissed: true })}>
              nie przypominaj o prywatności
            </Button>
          )}
        </div>
        <pre className="max-h-96 overflow-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
          {report || 'Generowanie raportu...'}
        </pre>
      </Section>

      <Section title="Dane surowe">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              if (dataset) downloadText(`${fileBase}.json`, JSON.stringify(buildJsonExport(dataset), null, 2), 'application/json')
            }}
          >
            Pobierz JSON
          </Button>
          {dataset &&
            Object.entries(csvFiles(dataset)).map(([name, content]) => (
              <Button key={name} onClick={() => downloadText(`${fileBase}_${name}`, content, 'text/csv;charset=utf-8')}>
                {name}
              </Button>
            ))}
        </div>
        <Note>
          JSON zawiera wszystkie surowe dane z okresu oraz wyliczenia pochodne. Pliki CSV są rozdzielone tematycznie, zeby dobrze
          otwieraly się w arkuszu.
        </Note>
      </Section>

      <Section title="Prywatność">
        <Note>
          Raport powstaje na urządzeniu i nie jest nigdzie wysylany. Jesli wkleisz go do zewnętrznej usługi AI, to Ty przekazujesz
          jej te dane - to świadoma decyzja, nie automat aplikacji.
        </Note>
      </Section>
      <Toast message={toast} />
    </Screen>
  )
}
