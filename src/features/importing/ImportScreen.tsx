import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { addLabResult, getMappings, saveDailyEntry, saveMapping, upsertLabTest } from '../../data/repo'
import { buildDailyPreview, buildLabPreview, type ImportPreview, type LabRowPreview } from '../../importing/apply'
import { IMPORT_FIELDS, suggestMapping } from '../../importing/fields'
import { LAB_COLUMNS } from '../../importing/apply'
import { flattenJson, parseDelimited, type ParsedTable } from '../../importing/parse'
import type { LabCategory } from '../../domain/types'
import { readFileAsText } from '../../lib/files'
import { normalizeKey } from '../../lib/text'
import { formatDatePl } from '../../lib/date'
import { Button, Chip, Note, Screen, Section, Toast } from '../../components/ui'
import { TextField } from '../../components/inputs'

type Kind = 'daily_csv' | 'lab_csv'

export function ImportScreen() {
  const [kind, setKind] = useState<Kind>('daily_csv')
  const [table, setTable] = useState<ParsedTable | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [mappingName, setMappingName] = useState<string | null>(null)
  const [overwriteConflicts, setOverwriteConflicts] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const existing = useLiveQuery(() => db.daily.toArray(), [])
  const tests = useLiveQuery(() => db.labTests.toArray(), [])
  const mappings = useLiveQuery(() => getMappings(), [])

  async function onFile(file: File) {
    const text = await readFileAsText(file)
    setFileName(file.name)
    setSaved(false)
    let parsed: ParsedTable
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        parsed = flattenJson(JSON.parse(text))
      } catch {
        setToast('Nie udało się odczytać pliku JSON.')
        return
      }
    } else {
      parsed = parseDelimited(text)
    }
    if (parsed.rows.length === 0) {
      setToast('Plik nie zawiera wierszy z danymi.')
      return
    }
    setTable(parsed)
    setColumnMap(kind === 'lab_csv' ? suggestLabMapping(parsed.headers) : suggestMapping(parsed.headers))
  }

  const dailyPreview: ImportPreview | null = useMemo(
    () => (table && kind === 'daily_csv' ? buildDailyPreview(table, columnMap, existing ?? []) : null),
    [table, columnMap, existing, kind],
  )
  const labPreview: LabRowPreview[] | null = useMemo(
    () => (table && kind === 'lab_csv' ? buildLabPreview(table, columnMap, tests ?? []) : null),
    [table, columnMap, tests, kind],
  )

  async function confirmImport() {
    if (dailyPreview) {
      let count = 0
      for (const row of dailyPreview.rows) {
        if (!row.date || row.status === 'invalid') continue
        if (row.status === 'conflict' && !overwriteConflicts) continue
        await saveDailyEntry({ ...row.values, date: row.date }, 'import')
        count++
      }
      setToast(`Zapisano dane dla ${count} dni.`)
    }
    if (labPreview) {
      let count = 0
      for (const row of labPreview) {
        if (!row.result) continue
        if (row.status === 'new_parameter') {
          await upsertLabTest({
            key: row.result.testKey,
            name: row.testName,
            category: 'other' as LabCategory,
            defaultUnit: row.result.unit,
            isCustom: true,
            sortOrder: 999,
          })
        }
        await addLabResult(row.result, 'import')
        count++
      }
      setToast(`Zapisano ${count} wyników badań.`)
    }
    if (mappingName && table) {
      await saveMapping({ name: mappingName, kind, columnMap })
    }
    setSaved(true)
  }

  return (
    <Screen title="Import" subtitle="Plik nie opuszcza urządzenia - wszystko dzieje się lokalnie">
      <Section title="Rodzaj danych">
        <div className="flex gap-2">
          <Chip active={kind === 'daily_csv'} onClick={() => { setKind('daily_csv'); setTable(null) }}>
            dane dzienne (sen, aktywność)
          </Chip>
          <Chip active={kind === 'lab_csv'} onClick={() => { setKind('lab_csv'); setTable(null) }}>
            wyniki badań
          </Chip>
        </div>
        <Note>
          {kind === 'daily_csv'
            ? 'CSV lub JSON z eksportu zegarka albo dowolnego arkusza. Kolumny zmapujesz poniżej; mapowanie można zapisać na przyszłość.'
            : 'CSV z kolumnami: date, test, value, unit, ref_min, ref_max, laboratory, fasting, notes. Nieznane parametry dodamy do katalogu po Twoim zatwierdzeniu.'}
        </Note>
      </Section>

      <Section title="Plik">
        <input
          type="file"
          accept=".csv,.txt,.tsv,.json"
          aria-label="Wybierz plik do importu"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onFile(file)
          }}
          className="field"
        />
        {fileName && (
          <Note>
            {fileName} · wierszy: {table?.rows.length ?? 0} · kolumn: {table?.headers.length ?? 0}
          </Note>
        )}
        {(mappings ?? []).filter((m) => m.kind === kind).length > 0 && table && (
          <div className="mt-3">
            <Note>Zapisane mapowania:</Note>
            <div className="mt-1 flex flex-wrap gap-2">
              {(mappings ?? [])
                .filter((m) => m.kind === kind)
                .map((m) => (
                  <Chip key={m.id} onClick={() => setColumnMap(m.columnMap)}>
                    {m.name}
                  </Chip>
                ))}
            </div>
          </div>
        )}
      </Section>

      {table && (
        <Section title="Mapowanie kolumn" hint="Po lewej kolumny z pliku (z przykładowa wartością), po prawej pola aplikacji.">
          {table.headers.map((header) => (
            <div key={header} className="mb-2 grid grid-cols-2 items-center gap-2">
              <div className="truncate text-xs">
                <span className="block truncate">{header}</span>
                <span className="text-[11px] text-[var(--color-muted)]">np. {table.rows[0]?.[header] || '-'}</span>
              </div>
              <select
                className="field text-sm"
                aria-label={`Mapowanie kolumny ${header}`}
                value={columnMap[header] ?? ''}
                onChange={(e) => setColumnMap((m) => ({ ...m, [header]: e.target.value }))}
              >
                <option value="">pomiń</option>
                {kind === 'daily_csv'
                  ? IMPORT_FIELDS.map((f) => (
                      <option key={String(f.key)} value={String(f.key)}>
                        {f.group}: {f.label}
                      </option>
                    ))
                  : LAB_COLUMNS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
              </select>
            </div>
          ))}
          <TextField label="Zapisz to mapowanie jako" value={mappingName} placeholder="np. Huawei - eksport miesieczny" onChange={setMappingName} />
        </Section>
      )}

      {dailyPreview && (
        <Section
          title="Podgląd przed zapisem"
          hint={`nowe: ${dailyPreview.counts.new} · aktualizacje: ${dailyPreview.counts.update} · konflikty: ${dailyPreview.counts.conflict} · błędne wiersze: ${dailyPreview.counts.invalid}`}
        >
          {dailyPreview.counts.conflict > 0 && (
            <label className="mb-3 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={overwriteConflicts} onChange={(e) => setOverwriteConflicts(e.target.checked)} />
              nadpisz istniejące wartości w dniach z konfliktem (poprzednie wartości zostaną w historii zmian)
            </label>
          )}
          <div className="max-h-80 overflow-y-auto text-xs">
            {dailyPreview.rows.slice(0, 200).map((row, i) => (
              <div key={`${row.date}-${i}`} className="border-b border-[var(--color-line)] py-1.5 last:border-0">
                <div className="flex justify-between">
                  <span>{row.date ? formatDatePl(row.date) : 'brak daty'}</span>
                  <span
                    className={
                      row.status === 'invalid'
                        ? 'text-[var(--color-warn)]'
                        : row.status === 'conflict'
                          ? 'text-[var(--color-warn)]'
                          : 'text-[var(--color-accent)]'
                    }
                  >
                    {row.status === 'new' ? 'nowy dzień' : row.status === 'update' ? 'uzupełnienie' : row.status === 'conflict' ? 'konflikt' : 'pomijamy'}
                  </span>
                </div>
                <div className="text-[var(--color-muted)]">
                  {Object.entries(row.values)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(', ') || 'brak wartości'}
                </div>
                {row.conflicts.length > 0 && (
                  <div className="text-[var(--color-warn)]">
                    konflikt: {row.conflicts.map((c) => `${c.field}: w bazie ${String(c.existing)} / w pliku ${String(c.incoming)}`).join('; ')}
                  </div>
                )}
                {row.problems.map((p) => (
                  <div key={p} className="text-[var(--color-warn)]">
                    {p}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => void confirmImport()} disabled={saved}>
              {saved ? 'Zaimportowano' : 'Zatwierdź i zapisz'}
            </Button>
            <Button variant="ghost" onClick={() => setTable(null)}>
              Anuluj
            </Button>
          </div>
        </Section>
      )}

      {labPreview && (
        <Section
          title="Podgląd wyników badań"
          hint={`do zapisania: ${labPreview.filter((r) => r.result).length} · nowe parametry: ${labPreview.filter((r) => r.status === 'new_parameter').length} · błędne: ${labPreview.filter((r) => r.status === 'invalid').length}`}
        >
          <div className="max-h-80 overflow-y-auto text-xs">
            {labPreview.slice(0, 200).map((row, i) => (
              <div key={i} className="border-b border-[var(--color-line)] py-1.5 last:border-0">
                <div className="flex justify-between">
                  <span>
                    {row.result?.date ? formatDatePl(row.result.date) : 'brak daty'} · {row.testName || 'brak parametru'}
                  </span>
                  <span className={row.status === 'invalid' ? 'text-[var(--color-warn)]' : 'text-[var(--color-accent)]'}>
                    {row.status === 'ok' ? 'ok' : row.status === 'new_parameter' ? 'nowy parametr' : 'pomijamy'}
                  </span>
                </div>
                {row.result && (
                  <div className="text-[var(--color-muted)]">
                    {row.result.value ?? row.result.valueText} {row.result.unit}
                    {row.result.refMin != null || row.result.refMax != null ? ` (zakres ${row.result.refMin ?? '-'}-${row.result.refMax ?? '-'})` : ''}
                    {row.result.laboratory ? ` · ${row.result.laboratory}` : ''}
                  </div>
                )}
                {row.problems.map((p) => (
                  <div key={p} className="text-[var(--color-warn)]">
                    {p}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => void confirmImport()} disabled={saved}>
              {saved ? 'Zaimportowano' : 'Zatwierdź i zapisz'}
            </Button>
            <Button variant="ghost" onClick={() => setTable(null)}>
              Anuluj
            </Button>
          </div>
        </Section>
      )}

      {!table && (
        <Section title="Huawei - jak pobrać dane">
          <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--color-muted)]">
            <li>Huawei Health: Ja / Ustawienia prywatności - Centrum prywatności.</li>
            <li>Wybierz pobranie kopii danych (Request your data) i zaznacz dane zdrowotne.</li>
            <li>Huawei wysyła e-mail z linkiem do zaszyfrowanego archiwum ZIP (hasło ustawiasz sam).</li>
            <li>Rozpakuj archiwum i wskaz tutaj plik JSON lub CSV z katalogu z danymi szczegółowymi.</li>
            <li>Zmapuj kolumny raz i zapisz mapowanie - kolejny import będzie już automatyczny.</li>
          </ol>
          <Note>
            Huawei Health nie udostępnia oficjalnej synchronizacji z Health Connect, dlatego import odbywa się z pliku eksportu.
            Struktura plików może się zmieniac między wersjami aplikacji - dlatego zawsze widzisz podgląd przed zapisem.
          </Note>
        </Section>
      )}
      <Toast message={toast} />
    </Screen>
  )
}

/** Kolumny wyników badań rozpoznajemy po typowych nazwach naglowkow. */
function suggestLabMapping(headers: string[]): Record<string, string> {
  const aliases: Record<string, string[]> = {
    date: ['date', 'data'],
    test: ['test', 'parametr', 'badanie', 'name', 'nazwa'],
    value: ['value', 'wynik', 'wartość'],
    unit: ['unit', 'jednostka'],
    ref_min: ['ref_min', 'min', 'od', 'norma od'],
    ref_max: ['ref_max', 'max', 'do', 'norma do'],
    laboratory: ['lab', 'laboratorium'],
    fasting: ['fasting', 'czczo'],
    notes: ['notes', 'uwagi', 'notatka', 'komentarz'],
  }
  const map: Record<string, string> = {}
  for (const header of headers) {
    const h = normalizeKey(header)
    for (const [field, list] of Object.entries(aliases)) {
      if (list.some((a) => h === a || h.includes(a))) {
        if (!Object.values(map).includes(field)) map[header] = field
        break
      }
    }
  }
  return map
}
