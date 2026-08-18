import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../../data/db'
import { addLabResult, deleteLabResult, updateLabResult, upsertLabTest } from '../../data/repo'
import { LAB_CATEGORY_LABELS } from '../../domain/catalog'
import type { LabCategory, LabResult } from '../../domain/types'
import { slugify } from '../../importing/apply'
import { formatDatePl, today } from '../../lib/date'
import { fmt } from '../../lib/stats'
import { LabChart } from '../../components/Chart'
import { Button, Chip, Empty, Note, Screen, Section, Toast } from '../../components/ui'
import { NumberField, Select, TextArea, TextField, Toggle } from '../../components/inputs'

export function LabsScreen() {
  const navigate = useNavigate()
  const [category, setCategory] = useState<LabCategory | 'all'>('all')
  const [adding, setAdding] = useState(false)

  const tests = useLiveQuery(() => db.labTests.toArray(), [])
  const results = useLiveQuery(() => db.labResults.toArray(), [])

  const rows = useMemo(() => {
    const sorted = (tests ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    return sorted
      .filter((t) => category === 'all' || t.category === category)
      .map((t) => {
        const own = (results ?? []).filter((r) => r.testKey === t.key).sort((a, b) => a.date.localeCompare(b.date))
        const last = own[own.length - 1]
        const prev = own[own.length - 2]
        return { test: t, last, prev, count: own.length }
      })
      .sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || (b.last?.date ?? '').localeCompare(a.last?.date ?? ''))
  }, [tests, results, category])

  return (
    <Screen
      title="Badania"
      subtitle="Każdy wynik zapisany z jednostka i zakresem laboratorium"
      action={
        <Button variant="primary" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Zamknij' : '+ Wynik'}
        </Button>
      }
    >
      {adding && <AddResultForm onDone={() => setAdding(false)} />}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <Chip active={category === 'all'} onClick={() => setCategory('all')}>
          wszystkie
        </Chip>
        {(Object.keys(LAB_CATEGORY_LABELS) as LabCategory[]).map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {LAB_CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </div>

      <Section title="Parametry" hint="Parametry bez wyniku są niżej na liście. Własny parametr dodasz przy dodawaniu wyniku.">
        {rows.map(({ test, last, prev, count }) => {
          const outside = last?.value != null && ((last.refMin != null && last.value < last.refMin) || (last.refMax != null && last.value > last.refMax))
          return (
            <button
              key={test.key}
              onClick={() => navigate(`/badania/${test.key}`)}
              className="flex w-full items-baseline justify-between border-b border-[var(--color-line)] py-2.5 text-left last:border-0"
            >
              <span className="text-sm">
                {test.name}
                <span className="ml-2 text-[11px] text-[var(--color-muted)]">{LAB_CATEGORY_LABELS[test.category]}</span>
              </span>
              <span className="text-right text-xs">
                {last ? (
                  <>
                    <span className={`block tabular-nums ${outside ? 'text-[var(--color-warn)]' : ''}`}>
                      {last.value != null ? `${fmt(last.value, 2)} ${last.unit}` : (last.valueText ?? '-')}
                    </span>
                    <span className="text-[var(--color-muted)]">
                      {formatDatePl(last.date)}
                      {prev?.value != null && last.value != null ? ` · zmiana ${last.value - prev.value > 0 ? '+' : ''}${fmt(last.value - prev.value, 2)}` : ''}
                      {count > 1 ? ` · ${count} wyników` : ''}
                    </span>
                  </>
                ) : (
                  <span className="text-[var(--color-muted)]">brak wyniku</span>
                )}
              </span>
            </button>
          )
        })}
      </Section>
    </Screen>
  )
}

function AddResultForm({ onDone, presetKey }: { onDone: () => void; presetKey?: string }) {
  const tests = useLiveQuery(() => db.labTests.toArray(), [])
  const results = useLiveQuery(() => db.labResults.toArray(), [])
  const [testKey, setTestKey] = useState<string | null>(presetKey ?? null)
  const [customName, setCustomName] = useState<string | null>(null)
  const [customCategory, setCustomCategory] = useState<string | null>('other')
  const [date, setDate] = useState(today())
  const [value, setValue] = useState<number | null>(null)
  const [valueText, setValueText] = useState<string | null>(null)
  const [unit, setUnit] = useState<string | null>(null)
  const [refMin, setRefMin] = useState<number | null>(null)
  const [refMax, setRefMax] = useState<number | null>(null)
  const [laboratory, setLaboratory] = useState<string | null>(null)
  const [fasting, setFasting] = useState<boolean | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const selected = (tests ?? []).find((t) => t.key === testKey)
  const isCustom = testKey === '__custom'

  // podpowiadamy jednostkę i zakres z ostatniego wyniku tego parametru - zwykle to samo laboratorium
  const lastForTest = useMemo(() => {
    const own = (results ?? []).filter((r) => r.testKey === testKey).sort((a, b) => a.date.localeCompare(b.date))
    return own[own.length - 1]
  }, [results, testKey])

  const effectiveUnit = unit ?? lastForTest?.unit ?? selected?.defaultUnit ?? ''
  const effectiveRefMin = refMin ?? lastForTest?.refMin ?? null
  const effectiveRefMax = refMax ?? lastForTest?.refMax ?? null
  const effectiveLab = laboratory ?? lastForTest?.laboratory ?? null
  const textual = selected?.textual === true

  async function save() {
    let key = testKey
    if (isCustom) {
      if (!customName) {
        setToast('Podaj nazwe własnego parametru.')
        return
      }
      key = slugify(customName)
      await upsertLabTest({
        key,
        name: customName,
        category: (customCategory as LabCategory) ?? 'other',
        defaultUnit: effectiveUnit || '-',
        isCustom: true,
        sortOrder: 999,
      })
    }
    if (!key) {
      setToast('Wybierz parametr.')
      return
    }
    if (value == null && !valueText) {
      setToast('Podaj wartość wyniku.')
      return
    }
    await addLabResult({
      testKey: key,
      date,
      value,
      valueText: value == null ? valueText : null,
      unit: effectiveUnit || '-',
      refMin: effectiveRefMin,
      refMax: effectiveRefMax,
      laboratory: effectiveLab,
      fasting,
      notes,
      source: 'manual',
    })
    setToast('Wynik zapisany.')
    window.setTimeout(onDone, 600)
  }

  return (
    <Section title="Nowy wynik" hint="Jednostka i zakres referencyjny zapisuja się razem z wynikiem - późniejsze zmiany nie ruszają historii.">
      <Select
        label="Parametr"
        value={testKey}
        options={[
          ...(tests ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'pl')).map((t) => ({ value: t.key, label: `${t.name} (${LAB_CATEGORY_LABELS[t.category]})` })),
          { value: '__custom', label: '+ własny parametr' },
        ]}
        onChange={(v) => {
          setTestKey(v)
          setUnit(null)
          setRefMin(null)
          setRefMax(null)
        }}
      />
      {isCustom && (
        <>
          <TextField label="Nazwa parametru" value={customName} placeholder="np. Homocysteina" onChange={setCustomName} />
          <Select
            label="Kategoria"
            value={customCategory}
            options={(Object.keys(LAB_CATEGORY_LABELS) as LabCategory[]).map((c) => ({ value: c, label: LAB_CATEGORY_LABELS[c] }))}
            onChange={setCustomCategory}
          />
        </>
      )}
      <div className="mb-3">
        <label className="mb-1.5 block text-sm">Data badania</label>
        <input className="field tabular-nums" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </div>
      {textual ? (
        <TextArea label="Wynik opisowy" value={valueText} onChange={setValueText} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Wartość" value={value} step={0.01} onChange={setValue} />
          <TextField label="Jednostka" value={unit ?? effectiveUnit} placeholder="np. ng/ml" onChange={setUnit} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Zakres od" value={refMin ?? effectiveRefMin} step={0.01} onChange={setRefMin} />
        <NumberField label="Zakres do" value={refMax ?? effectiveRefMax} step={0.01} onChange={setRefMax} />
      </div>
      <TextField label="Laboratorium" value={laboratory ?? effectiveLab} placeholder="np. Diagnostyka" onChange={setLaboratory} />
      <Toggle label="Na czczo" value={fasting} onChange={setFasting} />
      <TextArea label="Notatka" value={notes} onChange={setNotes} />
      <div className="mt-2 flex gap-2">
        <Button variant="primary" onClick={() => void save()}>
          Zapisz wynik
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
      </div>
      <Toast message={toast} />
    </Section>
  )
}

export function LabDetailScreen() {
  const { testKey = '' } = useParams<{ testKey: string }>()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<LabResult | null>(null)
  const [editValue, setEditValue] = useState<number | null>(null)

  const test = useLiveQuery(() => db.labTests.get(testKey), [testKey])
  const results = useLiveQuery(async () => (await db.labResults.where('testKey').equals(testKey).toArray()).sort((a, b) => a.date.localeCompare(b.date)), [testKey])

  const points = (results ?? []).map((r) => ({ date: r.date, value: r.value ?? null }))
  const last = (results ?? [])[(results ?? []).length - 1]

  return (
    <Screen
      title={test?.name ?? testKey}
      subtitle={test ? LAB_CATEGORY_LABELS[test.category] : undefined}
      action={
        <div className="flex gap-1">
          <Button variant="ghost" onClick={() => navigate('/badania')}>
            wróć
          </Button>
          <Button variant="primary" onClick={() => setAdding((a) => !a)}>
            + Wynik
          </Button>
        </div>
      }
    >
      {adding && <AddResultForm presetKey={testKey} onDone={() => setAdding(false)} />}

      {points.filter((p) => p.value != null).length >= 2 ? (
        <Section title="Trend" hint="Pasmo pokazuje zakres referencyjny z ostatniego wyniku.">
          <LabChart points={points} refMin={last?.refMin ?? null} refMax={last?.refMax ?? null} />
        </Section>
      ) : (
        <Section title="Trend">
          <Empty>Wykres pojawi się po drugim wyniku tego parametru.</Empty>
        </Section>
      )}

      <Section title="Wyniki">
        {(results ?? []).length === 0 ? (
          <Empty>Brak wyników tego parametru.</Empty>
        ) : (
          (results ?? [])
            .slice()
            .reverse()
            .map((r) => {
              const outside = r.value != null && ((r.refMin != null && r.value < r.refMin) || (r.refMax != null && r.value > r.refMax))
              return (
                <div key={r.id} className="border-b border-[var(--color-line)] py-2.5 text-sm last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>{formatDatePl(r.date)}</span>
                    <span className={`tabular-nums ${outside ? 'text-[var(--color-warn)]' : ''}`}>
                      {r.value != null ? `${fmt(r.value, 2)} ${r.unit}` : (r.valueText ?? '-')}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--color-muted)]">
                    zakres laboratorium: {r.refMin != null || r.refMax != null ? `${fmt(r.refMin, 2)}-${fmt(r.refMax, 2)} ${r.unit}` : (r.refText ?? 'nie podano')}
                    {r.laboratory ? ` · ${r.laboratory}` : ''}
                    {r.fasting != null ? ` · ${r.fasting ? 'na czczo' : 'nie na czczo'}` : ''}
                    {r.edited ? ' · poprawiony' : ''}
                    {r.source === 'import' ? ' · import' : ''}
                  </div>
                  {r.notes && <div className="mt-1 text-xs">{r.notes}</div>}
                  <div className="mt-1.5 flex gap-3 text-[11px]">
                    <button
                      className="text-[var(--color-accent)] underline"
                      onClick={() => {
                        setEditing(r)
                        setEditValue(r.value ?? null)
                      }}
                    >
                      popraw wartość
                    </button>
                    <button className="text-[var(--color-muted)] underline" onClick={() => void deleteLabResult(r.id as number)}>
                      usuń
                    </button>
                  </div>
                  {editing?.id === r.id && (
                    <div className="mt-2 rounded-xl border border-[var(--color-line)] p-3">
                      <NumberField label="Nowa wartość" value={editValue} step={0.01} onChange={setEditValue} />
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          onClick={async () => {
                            if (editValue != null) await updateLabResult(r.id as number, { value: editValue })
                            setEditing(null)
                          }}
                        >
                          Zapisz poprawke
                        </Button>
                        <Button variant="ghost" onClick={() => setEditing(null)}>
                          Anuluj
                        </Button>
                      </div>
                      <Note>Poprzednia wartość zostanie zachowana w historii zmian.</Note>
                    </div>
                  )}
                </div>
              )
            })
        )}
      </Section>
    </Screen>
  )
}
