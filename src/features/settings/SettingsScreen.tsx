import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { getRevisions, getSettings, saveSettings } from '../../data/repo'
import { createBackup, parseBackup, restoreBackup, wipeAllData } from '../../data/backup'
import { SCORE_LABELS } from '../../domain/catalog'
import type { Settings } from '../../domain/types'
import { formatMinutes, nowIso } from '../../lib/date'
import { downloadText, readFileAsText } from '../../lib/files'
import { Button, Chip, Note, Screen, Section, Toast } from '../../components/ui'
import { NumberField } from '../../components/inputs'

const SCORE_KEYS = ['energy', 'stress', 'irritability', 'recovery', 'mood', 'clarity'] as const
const SLEEP_THRESHOLDS = [360, 390, 420]

export function SettingsScreen() {
  const settings = useLiveQuery(() => getSettings(), [])
  const counts = useLiveQuery(async () => ({
    daily: await db.daily.count(),
    measurements: await db.measurements.count(),
    labResults: await db.labResults.count(),
    revisions: await db.revisions.count(),
  }), [])
  const recentRevisions = useLiveQuery(() => getRevisions(), [])
  const [toast, setToast] = useState<string | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge')

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 3000)
  }

  async function doBackup() {
    const backup = await createBackup()
    downloadText(`health_backup_${nowIso().slice(0, 10)}.json`, JSON.stringify(backup), 'application/json')
    await saveSettings({ lastBackupAt: nowIso() })
    notify('Kopia zapasowa pobrana.')
  }

  async function doRestore(file: File) {
    try {
      const backup = parseBackup(await readFileAsText(file))
      const result = await restoreBackup(backup, restoreMode)
      notify(`Przywrócono: ${result.counts.daily} dni, ${result.counts.labResults} wyników badań.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Nie udało się przywrocic kopii.')
    }
  }

  const visible = (settings?.visibleScores ?? []) as Settings['visibleScores']

  return (
    <Screen title="Ustawienia" subtitle="Aplikacja działa offline, dane są tylko na tym urządzeniu">
      <Section title="Codzienne minimum" hint="Metryki widoczne od razu w check-inie. Pozostale są pod przyciskiem 'więcej'.">
        <div className="flex flex-wrap gap-2">
          {SCORE_KEYS.map((key) => (
            <Chip
              key={key}
              active={visible.includes(key)}
              onClick={() => {
                const next = visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key]
                void saveSettings({ visibleScores: next })
              }}
            >
              {SCORE_LABELS[key]}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Kofeina" hint="Każda kawa jest liczona jako wielokrotność espresso; mg służy tylko do opisu w raporcie.">
        <NumberField
          label="Kofeina w jednym espresso"
          unit="mg"
          value={settings?.mgPerEspresso ?? 63}
          onChange={(v) => void saveSettings({ mgPerEspresso: v ?? 63 })}
        />
      </Section>

      <Section title="Próg krótkiego snu" hint="Używany w porownaniach warunkowych (np. rozdrażnienie w dniach z krótszym snem).">
        <div className="flex gap-2">
          {SLEEP_THRESHOLDS.map((m) => (
            <Chip key={m} active={(settings?.shortSleepMinutes ?? 390) === m} onClick={() => void saveSettings({ shortSleepMinutes: m })}>
              {formatMinutes(m)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Przypomnienie" hint="Jedno powiadomienie dziennie, bez ponawiania i bez serii dni.">
        <div className="flex items-center gap-3">
          <Chip
            active={settings?.reminderEnabled === true}
            onClick={async () => {
              const enabled = !(settings?.reminderEnabled ?? false)
              if (enabled && 'Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission()
              }
              await saveSettings({ reminderEnabled: enabled })
            }}
          >
            {settings?.reminderEnabled ? 'włączone' : 'wyłączone'}
          </Chip>
          <input
            className="field tabular-nums w-32"
            type="time"
            aria-label="Godzina przypomnienia"
            value={settings?.reminderTime ?? '21:00'}
            onChange={(e) => void saveSettings({ reminderTime: e.target.value })}
          />
        </div>
        <Note>
          Przypomnienie działa, gdy aplikacja jest otwarta w tle przeglądarki. Nie zastepuje alarmu systemowego - świadomie nie
          budujemy agresywnego systemu powiadomien.
        </Note>
      </Section>

      <Section title="Kopia zapasowa" hint="Jeden plik JSON z całość danych - trzymaj go tam, gdzie sam zdecydujesz.">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void doBackup()}>
            Pobierz kopię
          </Button>
          <Chip active={restoreMode === 'merge'} onClick={() => setRestoreMode('merge')}>
            przywracanie: scal
          </Chip>
          <Chip active={restoreMode === 'replace'} onClick={() => setRestoreMode('replace')}>
            przywracanie: zastąp
          </Chip>
        </div>
        <input
          type="file"
          accept=".json"
          className="field"
          aria-label="Wybierz plik kopii zapasowej"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void doRestore(file)
          }}
        />
        <Note>Ostatnia kopia: {settings?.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString('pl-PL') : 'nigdy'}</Note>
      </Section>

      <Section title="Twoje dane">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div className="flex justify-between">
            <span>Dni z wpisami</span>
            <span className="tabular-nums">{counts?.daily ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Pomiary</span>
            <span className="tabular-nums">{counts?.measurements ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Wyniki badań</span>
            <span className="tabular-nums">{counts?.labResults ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Zapisane zmiany</span>
            <span className="tabular-nums">{counts?.revisions ?? 0}</span>
          </div>
        </div>
        <Note>
          Dane są zapisane w pamięci przeglądarki na tym urządzeniu (IndexedDB). Nie ma serwera, konta ani analityki. Wyczyszczenie
          danych przeglądarki usuwa również te aplikację - dlatego warto co jakiś czas pobrać kopię.
        </Note>
      </Section>

      <Section title="Historia zmian" hint="Każda edycja wpisu jest zapisana - nic nie jest nadpisywane bezśladowo.">
        {(recentRevisions ?? []).slice(0, 8).map((r) => (
          <div key={r.id} className="border-b border-[var(--color-line)] py-1.5 text-xs last:border-0">
            <span className="text-[var(--color-muted)]">{new Date(r.changedAt).toLocaleString('pl-PL')} · </span>
            {r.entity === 'daily_entry' ? 'wpis dzienny' : r.entity === 'lab_result' ? 'wynik badania' : r.entity} {r.entityId} ·{' '}
            {r.changeType === 'create' ? 'dodano' : r.changeType === 'update' ? 'zmieniono' : 'usunięto'}
            {r.actor === 'import' ? ' (import)' : ''}
          </div>
        ))}
        {(recentRevisions ?? []).length === 0 && <Note>Brak zapisanych zmian.</Note>}
      </Section>

      <Section title="Usunięcie danych" hint="Operacja nieodwracalna. Pobierz najpierw kopię zapasowa.">
        {!confirmWipe ? (
          <Button variant="danger" onClick={() => setConfirmWipe(true)}>
            Usuń wszystkie dane
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => void doBackup()}>
              Najpierw pobierz kopię
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await wipeAllData()
                setConfirmWipe(false)
                notify('Wszystkie dane zostaly usunięte z urządzenia.')
              }}
            >
              Tak, usuń wszystko
            </Button>
            <Button onClick={() => setConfirmWipe(false)}>Anuluj</Button>
          </div>
        )}
      </Section>

      <Section title="O aplikacji">
        <Note>
          Aplikacja służy do zbierania danych, obserwacji trendów i przygotowania zestawień do rozmowy z lekarzem lub analizy przez
          zewnętrznego asystenta AI. Nie jest narzędziem medycznym, nie diagnozuje i nie generuje zaleceń zdrowotnych.
        </Note>
      </Section>
      <Toast message={toast} />
    </Screen>
  )
}
