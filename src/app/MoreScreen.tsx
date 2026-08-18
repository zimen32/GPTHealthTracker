import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { Note, Screen, Section } from '../components/ui'

const LINKS = [
  { to: '/historia', label: 'Historia i kalendarz', hint: 'uzupełnij lub popraw dowolny dzień' },
  { to: '/pomiary', label: 'Pomiary okresowe', hint: 'masa, obwody, ciśnienie, częstotliwość' },
  { to: '/eksport', label: 'Eksport do analizy AI', hint: 'raport Markdown, JSON, CSV' },
  { to: '/import', label: 'Import danych', hint: 'CSV/JSON z zegarka, wyniki badań' },
  { to: '/ustawienia', label: 'Ustawienia i kopia zapasowa', hint: 'codzienne minimum, backup, usunięcie danych' },
]

export function MoreScreen() {
  const navigate = useNavigate()
  const counts = useLiveQuery(async () => ({
    daily: await db.daily.count(),
    labResults: await db.labResults.count(),
  }), [])

  return (
    <Screen title="Więcej" subtitle={`${counts?.daily ?? 0} dni z wpisami · ${counts?.labResults ?? 0} wyników badań`}>
      <Section title="Sekcje">
        {LINKS.map((link) => (
          <button
            key={link.to}
            onClick={() => navigate(link.to)}
            className="flex w-full items-center justify-between border-b border-[var(--color-line)] py-3 text-left last:border-0"
          >
            <span>
              <span className="block text-sm">{link.label}</span>
              <span className="text-xs text-[var(--color-muted)]">{link.hint}</span>
            </span>
            <span className="text-[var(--color-muted)]">›</span>
          </button>
        ))}
      </Section>
      <Section title="Zasada działania">
        <Note>
          Aplikacja zbiera dane, pokazuje trendy i zależności oraz przygotowuje zestawienia do dalszej analizy. Nie diagnozuje i nie
          wydaje zaleceń. Dane pozostają na tym urządzeniu.
        </Note>
      </Section>
    </Screen>
  )
}
