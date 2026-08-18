# Health Tracker — propozycja architektury (do akceptacji)

Status: **PROPOZYCJA — brak implementacji.** Dokument opisuje stack, architekturę, model danych,
ekrany, przepływ Daily Check-in, format eksportu dla AI, plan MVP, ryzyka i model prywatności.
Implementacja startuje dopiero po akceptacji.

Aplikacja **nie jest** urządzeniem/aplikacją medyczną, nie diagnozuje i nie generuje zaleceń
zdrowotnych. Jej rola: rzetelne przechowywanie danych, prezentacja trendów i anomalii,
przygotowanie danych do rozmowy z lekarzem lub analizy przez zewnętrznego asystenta AI.

---

## 1. Proponowany stack

### Rekomendacja: aplikacja web offline-first (PWA) w TypeScript, później opakowana w APK (Capacitor)

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Język | TypeScript (strict) | typy dla wieloletniego modelu danych, jeden język w całym projekcie |
| UI | React 19 + Vite | stabilne, ogromna baza wiedzy, szybki dev loop |
| Style | Tailwind CSS + własne, minimalne komponenty | brak zależności od ciężkich UI-kitów, pełna kontrola nad UX check-inu |
| Baza danych | **Dexie 4 (IndexedDB)** | lokalna, transakcyjna, wersjonowane migracje, działa identycznie w przeglądarce i w WebView APK |
| Reaktywność danych | `dexie-react-hooks` (`useLiveQuery`) | brak potrzeby Redux/Zustand — źródłem prawdy jest baza |
| Wykresy | Recharts (kandydat alternatywny: uPlot) | wystarczające dla 7–365 dni, deklaratywne, bez zewnętrznych requestów |
| Analityka/statystyka | własny moduł `analytics/` (czysty TS, bez zależności) | testowalne funkcje, pełna kontrola nad językiem opisu (brak języka diagnostycznego) |
| Testy | Vitest (unit/integration, `fake-indexeddb`) + Playwright (E2E, Chromium) | całość uruchamiana w CI i w tym środowisku |
| Pakiet Android | Capacitor 7 (etap późniejszy) | ten sam kod → realny APK, prywatny storage aplikacji, dostęp do systemu plików i (opcjonalnie) Health Connect przez plugin |
| Backend | **brak** | wymaganie privacy-first; zero ruchu sieciowego w runtime |
| CI | GitHub Actions: lint + typecheck + testy; osobny workflow budujący debug-APK jako artefakt | brak konieczności lokalnego Android Studio |

**Dlaczego nie natywny Kotlin + Compose + Room (rozważana alternatywa nr 1):** technicznie to
najlepsza „docelowa” aplikacja na Androida, ale jej główna przewaga — automatyczny import z
Health Connect — w praktyce **nie działa dla Huawei** (patrz §8: Huawei Health nie integruje się
z Health Connect). Zostaje więc ta sama droga danych (import pliku eksportu), przy wyższym koszcie
utrzymania i braku możliwości weryfikacji buildu/testów UI w tym środowisku (brak Android SDK,
brak emulatora). Kotlin/Room pozostaje sensowną opcją, jeśli świadomie akceptujesz konieczność
pracy w Android Studio — powiedz, jeśli wolisz tę ścieżkę.

**Dlaczego nie Flutter (alternatywa nr 2):** działałby dobrze, ale nie daje przewagi nad PWA/Capacitor
w tym zestawie funkcji (formularze, wykresy, pliki), a dodaje drugi ekosystem i ~1 GB SDK.

**Dlaczego nie SQLite (WASM) zamiast IndexedDB:** wolumen danych jest mały (5 lat ≈ 1800 wierszy
dziennych + kilkaset wyników badań) — cała analityka mieści się w pamięci. IndexedDB działa tak samo
w przeglądarce i w WebView, więc unikamy dwóch backendów storage. Jeśli w przyszłości pojawi się
potrzeba zapytań ad-hoc SQL, eksport JSON/CSV jest zawsze dostępny jako droga do dowolnego narzędzia.

---

## 2. Architektura aplikacji

Warstwy (zależności tylko „w dół”, brak zależności odwrotnych):

```
src/
  app/            routing, layout, motyw, rejestracja service workera
  features/
    checkin/      Daily Check-in (ekran + logika formularza)
    history/      kalendarz, edycja dni wcześniejszych, uzupełnianie braków
    dashboard/    sekcje: regeneracja / samopoczucie / aktywność / ciało / badania
    labs/         wyniki laboratoryjne + katalog parametrów
    measurements/ pomiary okresowe + harmonogramy
    insights/     trendy, odchylenia, korelacje (opisy neutralne językowo)
    import/       CSV/JSON, kreator mapowania kolumn, presety (Huawei, laby)
    export/       eksport JSON / CSV / Markdown „dla AI”
    settings/     przypomnienia, jednostki, backup/restore, usuwanie danych, dokument prywatności
  domain/         typy encji, słowniki (parametry badań, typy pomiarów), walidacja (zod)
  data/           Dexie: schemat, migracje, repozytoria, journal zmian
  analytics/      czyste funkcje: agregacje, rolling mean, mediana, z-score, korelacje, detekcja braków
  reporting/      generatory: markdown-report, json-export, csv-export
  lib/            daty/strefy czasowe, konwersje jednostek, crypto (backup), pliki
```

Zasady:
- **Offline-first, zero-network:** w runtime nie ma ani jednego żądania HTTP. Service worker cache’uje
  wyłącznie własne zasoby aplikacji (brak CDN, brak fontów zewnętrznych).
- **Repozytoria jako jedyne wejście do bazy** — dzięki temu każdy zapis przechodzi przez journal zmian
  (§ wymaganie o historii edycji) i walidację.
- **Analityka bez efektów ubocznych** — funkcje `(dane, okres) → wynik`, w 100 % pokryte testami; to
  one decydują o tym, co pokazuje dashboard i co trafia do raportu AI, więc muszą być deterministyczne.
- **Warstwa importu jest odwracalna** — każdy import to „batch” z ID; można podejrzeć i wycofać.

---

## 3. Model danych

Konwencje:
- `date` — lokalna data kalendarzowa `YYYY-MM-DD` (dzień, do którego przypisujemy dane; dla snu:
  dzień **wybudzenia**). Znaczniki czasu zdarzeń trzymane osobno jako ISO-8601 z offsetem.
- Wszystkie pola pomiarowe są **nullable** — pominięcie pola jest normalnym stanem, nie błędem.
- Nic nie jest nadpisywane w sposób bezśladowy: każda modyfikacja trafia do `revisions`.
- Wartości liczbowe i jednostki są przechowywane **osobno**; nigdy nie zapisujemy samego „w normie”.

### 3.1 `daily_entries` — jeden rekord na dzień (subiektywne + styl życia + aktywność zbiorcza)

```
id                     string (= date, PK)
date                   'YYYY-MM-DD'
energy_score           1..10 | null
stress_score           1..10 | null
irritability_score     1..10 | null
mental_clarity_score   1..10 | null
recovery_score         1..10 | null
mood_score             1..10 | null
steps                  int | null
walking_minutes        int | null
sedentary_minutes      int | null
training_done          bool | null
caffeine_mg            int | null            // w UI: „kawy/porcje” → mg wg konfiguracji
caffeine_last_time     'HH:mm' | null
alcohol_units          number | null
water_ml               int | null
unusual_stress         bool | null
illness                bool | null
notes                  text | null
created_at, updated_at ISO-8601
```

### 3.2 `sleep_records` — jedna noc, osobna tabela (bo dane mogą pochodzić z importu i współistnieć z ręcznymi)

```
id                  uuid
date                'YYYY-MM-DD'    // dzień wybudzenia
source              'manual' | 'huawei_export' | 'health_connect' | 'csv_import'
bedtime             ISO-8601 | null
sleep_start         ISO-8601 | null
wake_time           ISO-8601 | null
total_sleep_minutes int | null
deep_sleep_minutes  int | null
rem_sleep_minutes   int | null
light_sleep_minutes int | null
awake_minutes       int | null
awakenings          int | null
sleep_score         int | null
resting_heart_rate  int | null
hrv_ms              number | null
spo2_avg            number | null
spo2_min            number | null
import_batch_id     uuid | null
is_primary          bool            // który rekord jest źródłem prawdy dla danego dnia
created_at, updated_at
```
Reguła precedencji przy konflikcie: dane z zegarka mają wyższy priorytet dla metryk obiektywnych
(fazy snu, HRV, RHR), ręczne dla godzin, jeśli użytkownik je poprawił. Konflikt zawsze **pokazujemy**,
nigdy nie usuwamy przegranego rekordu.

### 3.3 `workouts` — 0..n treningów dziennie

```
id, date, type (string, słownik rozszerzalny), duration_minutes, intensity 1..10 | null,
notes | null, source, created_at, updated_at
```

### 3.4 `measurements` — pomiary okresowe (format długi, łatwo dodać nowy typ)

```
id, measured_at ISO-8601, date, type, value number, unit string,
source 'manual'|'import', notes | null, created_at, updated_at
```
`type` ∈ `body_weight, waist, chest, arm, thigh, calf, blood_pressure_systolic,
blood_pressure_diastolic, resting_heart_rate_manual` (+ własne). Ciśnienie zapisywane jako dwa
rekordy o wspólnym `measured_at`, prezentowane jako jedna para.

### 3.5 `measurement_schedules` — częstotliwość, bez presji codzienności

```
id, type, interval_days (np. 7, 14, 30), enabled bool, last_done_date, reminder_enabled bool
```

### 3.6 `lab_tests` — katalog parametrów (rozszerzalny przez użytkownika)

```
id, key (np. 'ferritin'), display_name, category
  ('cbc'|'metabolic'|'lipids'|'liver'|'thyroid'|'iron'|'vitamins'|'inflammation'|'urine'|'other'),
default_unit, alternative_units[], higher_is_better | null, is_custom bool, sort_order
```
Seed zawiera parametry z listy wymagań (morfologia, metabolizm, lipidy, wątroba, tarczyca, żelazo,
witaminy, CRP, badanie ogólne moczu). Brak jakiegokolwiek parametru nie blokuje aplikacji.

### 3.7 `lab_results` — wynik pojedynczego oznaczenia (historia niemodyfikowana zmianami katalogu)

```
id                uuid
test_id           → lab_tests.id
date              'YYYY-MM-DD'
collected_at      ISO-8601 | null
value_numeric     number | null
value_text        string | null      // tylko dla wyników nienumerycznych (np. opis moczu)
unit              string            // snapshot, NIE referencja do katalogu
ref_min           number | null     // snapshot zakresu z TEGO laboratorium i TEJ daty
ref_max           number | null
ref_text          string | null     // gdy laboratorium podaje zakres opisowy
laboratory_name   string | null
fasting           bool | null
notes             text | null
source            'manual'|'csv_import'|'ocr'
import_batch_id   uuid | null
created_at, updated_at
```
**Kluczowe:** `unit`, `ref_min`, `ref_max`, `laboratory_name` są zapisane przy wyniku. Zmiana zakresów
w katalogu lub w laboratorium **nigdy** nie modyfikuje wyników historycznych.

### 3.8 `revisions` — dziennik zmian (append-only)

```
id, entity ('daily_entry'|'sleep_record'|'lab_result'|'measurement'|'workout'),
entity_id, changed_at ISO-8601, change_type ('create'|'update'|'delete'),
before json | null, after json | null, reason string | null, actor 'user'|'import'|'migration'
```
Umożliwia poprawianie błędnych wpisów bez utraty informacji, że wpis był zmieniany; UI pokazuje
znacznik „edytowano” z historią. Rekordy „usunięte” są oznaczane (`deleted_at`), nie wymazywane —
poza globalnym „usuń wszystkie dane”, które czyści całą bazę.

### 3.9 `import_mappings` i `import_batches`

```
import_mappings: id, name, source_kind ('huawei_export'|'huawei_csv'|'lab_csv'|'generic_csv'),
                 column_map json, transforms json, created_at, last_used_at
import_batches:  id, mapping_id, file_name, file_hash, imported_at, rows_total,
                 rows_imported, rows_skipped, log json, status
```
Zapisane mapowanie = kolejny import to 2 kliknięcia. `file_hash` chroni przed przypadkowym
podwójnym importem tego samego pliku.

### 3.10 `settings`, `notes_journal`

`settings`: jednostki, definicja porcji kofeiny, wartości domyślne check-inu, godzina przypomnienia,
progi „długi/krótki sen” do porównań warunkowych, preferencje eksportu.

---

## 4. Lista ekranów

1. **Dziś (Daily Check-in)** — ekran startowy, główna droga wprowadzania danych (§5).
2. **Historia / Kalendarz** — miesięczna siatka z oznaczeniem kompletności dnia (pełny / częściowy /
   pusty), wejście w dowolny dzień = ten sam formularz check-inu z danymi do edycji.
3. **Dashboard** — sekcje A–E (regeneracja, samopoczucie, aktywność, ciało, badania), przełącznik
   zakresu 7 / 30 / 90 / 180 / 365 dni; każda kafelka pokazuje trend (średnia + kierunek + zmiana %),
   nie pojedynczą liczbę.
4. **Trendy i zależności (Insights)** — opisy zmian w czasie i lista potencjalnych korelacji z licznikiem
   dni danych; stały, widoczny dopisek „Korelacja nie oznacza przyczynowości”.
5. **Badania** — lista parametrów z ostatnią wartością i zmianą; ekran parametru = wykres w czasie +
   pasmo referencyjne laboratorium + tabela wyników; dodanie wyniku; zarządzanie katalogiem.
6. **Pomiary** — lista typów z harmonogramem („następny pomiar: za 3 dni”), szybkie dodanie, wykresy.
7. **Import** — wybór presetu / kreator mapowania kolumn, podgląd wykrytych wierszy, zatwierdzenie,
   log importu, możliwość wycofania batcha.
8. **Eksport do analizy AI** — wybór zakresu (7 / 30 / 90 dni / od ostatnich badań / własny) i formatu
   (Markdown do wklejenia, JSON, CSV); podgląd raportu z przyciskiem „kopiuj”.
9. **Ustawienia** — przypomnienie (jedno dzienne, wyłączalne), jednostki i porcje, backup/restore,
   „usuń wszystkie dane” (z potwierdzeniem), dokument „Gdzie są moje dane”.

---

## 5. Dokładny przepływ Daily Check-in (cel: 30–60 s)

Jeden ekran, przewijany, trzy sekcje; **każde pole opcjonalne**, przycisk „Zapisz” aktywny od początku.
Brak walidacji blokującej, brak wymaganych pól, brak ekranów pośrednich.

**Krok 1 — Samopoczucie (≈15 s, 5 suwaków 1–10, jeden gest każdy)**
`energia`, `stres`, `rozdrażnienie`, `regeneracja`, `nastrój`.
- Wartości startowe: mediana z ostatnich 7 dni (jeśli brak historii — pusta, nie „5”).
- Suwak nietknięty = pole puste (zapisujemy `null`, nie domyślną liczbę). Widoczny stan „nie podano”.
- `mental_clarity` domyślnie ukryte pod „więcej” (konfigurowalne w ustawieniach — użytkownik decyduje,
  które 4–6 metryk są jego „codziennym minimum”).

**Krok 2 — Sen (≈10 s)**
- Jeśli dla tego dnia istnieje rekord z importu Huawei: sekcja pokazuje gotowe dane w trybie „tylko
  podglądu” z etykietą źródła; nic nie trzeba wpisywać.
- Jeśli nie: dwa pola czasu (`sleep_start`, `wake_time`) z wartościami domyślnymi = mediana z 7 dni,
  automatycznie wyliczany `total_sleep_minutes`; opcjonalnie `sleep_score` i liczba wybudzeń.
- Fazy snu, HRV, RHR, SpO2 — nigdy nie wpisywane ręcznie w check-inie; wchodzą wyłącznie importem
  albo przez „Dodaj szczegóły snu” (rzadka ścieżka).

**Krok 3 — Dzień (≈15 s)**
- `kroki` (jedno pole numeryczne), `trening` (przełącznik; po włączeniu: typ z ostatnio używanych,
  czas, intensywność — 3 tapy),
- `kofeina` jako licznik porcji `− 2 +` z godziną ostatniej porcji (podpowiedź: ostatnia użyta),
- `alkohol` licznik jednostek (domyślnie 0), `woda` licznik szklanek,
- dwa przełączniki: `nietypowy stres`, `choroba/infekcja`,
- `notatka` — jedno pole tekstowe.

**Sekcja opcjonalna „Pomiary” (pojawia się tylko wtedy, gdy harmonogram na to wskazuje)**
np. „Waga — ostatni pomiar 8 dni temu” + jedno pole. Nigdy nie jest wymagana, nigdy nie pokazujemy
wszystkich pomiarów naraz.

**Zapis**
- Zapis inkrementalny (autosave po każdej zmianie do lokalnego draftu) + jawny przycisk „Zapisz”.
- Po zapisaniu: jedno zdanie podsumowania bez ocen, np. „Zapisano 18.08 — sen 6 h 40 min, energia 5”.
- Wskaźnik kompletności („zebrano 6/10 pól”) jako informacja, **nie** jako streak/gamifikacja.
- Uzupełnianie wstecz: ten sam formularz z paska „Brakujące dni: 14.08, 15.08” na ekranie Dziś.
- Edycja dnia przeszłego zapisuje rekord w `revisions` i oznacza dzień jako edytowany.

**Przypomnienia:** maksymalnie jedno powiadomienie dziennie o wybranej godzinie, domyślnie wyłączone,
bez ponawiania, bez „streaków”, bez presji. (W wariancie PWA: notyfikacja lokalna przy otwartej
aplikacji/SW; w wariancie APK: lokalny alarm systemowy — to jeden z argumentów za etapem Capacitor.)

---

## 6. Format eksportu dla AI

Ekran „EKSPORT DO ANALIZY AI” → wybór zakresu (7 / 30 / 90 dni / od ostatnich badań / własny) →
trzy artefakty: `report.md`, `data.json`, `*.csv` (paczka). Wszystko generowane lokalnie, bez wysyłki.

### 6.1 Raport Markdown (struktura zgodna z wymaganiami; optymalizowany pod wklejenie do ChatGPT/Claude)

```markdown
# Health Tracking Report

## Period
2026-05-20 – 2026-08-18 (91 dni; dni z danymi: 78/91 = 86%)

## Sleep
- Average sleep: 6 h 41 min (poprz. okres: 7 h 05 min, −5,6%)
- Deep sleep: 58 min | REM: 71 min | Light: 4 h 32 min | Awake: 22 min
- HRV: 41 ms (poprz. 46 ms, −10,9%) | Resting HR: 62 bpm (poprz. 59 bpm, +5,1%)
- Sleep score: 74 | dni z danymi z zegarka: 61/91

## Subjective wellbeing
- Energy: 4,6 / Stress: 6,8 / Irritability: 6,1 / Recovery: 4,4 / Mood: 5,2 (średnie, skala 1–10)

## Activity
- Average steps: 6 120 | Training sessions: 11 | Average training duration: 44 min

## Body
- Weight: 84,2 kg (zmiana w okresie: −0,8 kg) | Waist: 92 cm
- Blood pressure (ostatni pomiar 2026-08-10): 128/82 mmHg

## Lifestyle
- Average caffeine: 240 mg/d (mediana godziny ostatniej porcji: 16:20)
- Alcohol: 2,1 j./tydz. | Water: 1,9 l/d
- Notes: 23 wpisy tekstowe (dołączone w sekcji Appendix)

## Laboratory results
| Date | Test | Value | Unit | Reference | Lab | Fasting |
|---|---|---|---|---|---|---|
| 2026-07-14 | Ferritin | 38 | ng/mL | 30–400 | Lab X | tak |
| 2026-07-14 | TSH | 2,10 | mIU/L | 0,27–4,20 | Lab X | tak |
| 2026-02-03 | Ferritin | 61 | ng/mL | 30–400 | Lab X | tak |

## Trends
- Średni sen spadł z 7 h 05 min do 6 h 41 min w ostatnich 30 dniach względem poprzednich 30 dni.
- Średnie HRV jest o 11% niższe niż w poprzednim okresie 30-dniowym.
- Średni poziom stresu: 6,8 vs 5,9 w poprzednim okresie.

## Potential correlations
(wyłącznie zależności z n ≥ 14 dni; korelacja nie oznacza przyczynowości)
- Sen (noc) → energia (następny dzień): Spearman ρ = 0,48 (n = 71)
- Rozdrażnienie: dni ze snem < 6 h 30 min: 6,9 (n = 31) vs dni ≥ 6 h 30 min: 5,2 (n = 40)
- Kofeina po 16:00 → długość snu: ρ = −0,21 (n = 58; słaba zależność)

## Missing data
- HRV: brak w 30/91 dni | Kroki: brak w 12/91 dni | Ciśnienie: 3 pomiary w okresie
- Brak wyników: witamina D (ostatni: brak), B12 (ostatni: 2026-02-03, >6 mies.)

## Recent changes
- Ostatnie 14 dni vs poprzednie 14: sen −18 min/d, energia −0,7, stres +0,9, kroki +840.

## Context for the analyst
Dane samoraportowane i z zegarka Huawei; brak walidacji klinicznej. Skale 1–10 są subiektywne.
Raport nie zawiera interpretacji medycznych — jest zestawieniem danych do dalszej analizy.

## Appendix — daily notes
2026-08-14: „…”
```

Zasady językowe raportu i całego UI: opisujemy **co pokazują dane** („w ostatnich 21 dniach odnotowano
wyższy średni poziom stresu i krótszy sen niż w poprzednich 21 dniach”), nigdy nie stawiamy tez o stanie
zdrowia („masz objawy przeciążenia” — zakazane). Generator raportu ma testy sprawdzające, że nie
wstawia sformułowań diagnostycznych ani zaleceń.

### 6.2 JSON (surowe dane, wersjonowany schemat)

```json
{
  "schema_version": 1,
  "generated_at": "2026-08-18T20:10:00+02:00",
  "period": { "from": "2026-05-20", "to": "2026-08-18" },
  "profile": { "sex": "male", "age": 36, "note": "user-provided context" },
  "daily": [ { "date": "2026-08-17", "energy_score": 5, "sleep": { "total_sleep_minutes": 401, "source": "huawei_export" }, "workouts": [] } ],
  "measurements": [ { "date": "2026-08-10", "type": "blood_pressure_systolic", "value": 128, "unit": "mmHg" } ],
  "lab_results": [ { "date": "2026-07-14", "test": "ferritin", "value": 38, "unit": "ng/mL", "ref_min": 30, "ref_max": 400, "laboratory": "Lab X", "fasting": true } ],
  "derived": { "trends": [], "correlations": [] },
  "completeness": { "days_total": 91, "days_with_any_data": 78, "fields": { "hrv_ms": 61 } }
}
```

### 6.3 CSV

`daily.csv`, `sleep.csv`, `workouts.csv`, `measurements.csv`, `lab_results.csv` — jeden nagłówek,
jedna jednostka na kolumnę (jednostka w nazwie kolumny lub w osobnej kolumnie `unit`), separator `,`,
UTF-8, daty ISO. Bez scalonych komórek i bez formatowania — plik ma być czytelny dla arkusza i dla AI.

---

## 7. Import danych

### 7.1 Huawei — co jest realnie dostępne (zweryfikowane, sierpień 2026)

- **Huawei Health nie ma oficjalnej integracji z Google Health Connect** — ekosystem HMS jest odcięty
  od GMS. Obejścia to aplikacje-pomosty firm trzecich (np. Health Sync), działające
  półautomatycznie i z ograniczonym zakresem typów danych.
- **Oficjalna droga eksportu istnieje i jest stabilna:** Huawei Health → *Me / Privacy center →
  Request your data* → e-mail z linkiem do **zaszyfrowanego ZIP** (hasło ustawia użytkownik) →
  katalog „Health detail data & description” z plikami **JSON** (m.in. tętno, sen, aktywność).
  To jest podstawa importu w MVP.
- **Huawei Health Kit (REST/SDK)** istnieje jako oficjalne API, ale wymaga konta Huawei Developer,
  weryfikacji tożsamości i **osobnego zatwierdzenia aplikacji oraz zakresów danych zdrowotnych** przez
  Huawei. Dla prywatnej aplikacji jednej osoby to ścieżka niepewna i długa — **nie budujemy na niej
  żadnej krytycznej funkcji**. Może zostać dodana później jako opcjonalny adapter.

Wniosek architektoniczny: warstwa importu jest zaprojektowana wokół **plików**, z interfejsem
`SleepDataSource` gotowym na podmianę źródła (plik → Health Connect → Health Kit) bez zmian w modelu
danych i UI.

### 7.2 Przepływ importu

1. Wybór pliku (CSV/JSON/ZIP) — plik nigdy nie opuszcza urządzenia.
2. Auto-detekcja formatu; jeśli rozpoznany preset (Huawei JSON / Huawei CSV / CSV laboratoryjny) —
   mapowanie proponowane automatycznie.
3. **Kreator mapowania kolumn**: lewa strona = kolumny/klucze z pliku (z przykładowymi wartościami),
   prawa = pola aplikacji; konwersje (jednostki, formaty czasu, sekundy→minuty, strefa czasowa).
4. **Podgląd przed zapisem**: tabela wszystkich wykrytych wierszy z oznaczeniem: nowe / konflikt z
   istniejącym / do pominięcia. Nic nie zapisuje się bez zatwierdzenia.
5. Zapis jako `import_batch` + możliwość wycofania.
6. Mapowanie zapisywane pod nazwą → kolejny miesięczny import to wybór presetu i „Importuj”.

### 7.3 Import wyników badań

- ręczne wpisanie (formularz z autouzupełnianiem nazwy parametru, jednostki i ostatnio używanego
  zakresu referencyjnego danego laboratorium),
- import CSV (z tym samym kreatorem mapowania),
- **OCR z PDF/zdjęcia — poza MVP (etap 11), wyłącznie w trybie z obowiązkowym przeglądem:** wszystkie
  rozpoznane wartości pokazywane przed zapisem, każda z możliwością korekty, oznaczenie pewności;
  wartość niepewna nigdy nie jest zapisywana automatycznie. Rozważane biblioteki działające lokalnie
  (Tesseract.js / ML Kit w wariancie APK) — bez wysyłania obrazów gdziekolwiek.

---

## 8. Analityka: trendy, odchylenia, korelacje

**Trendy (moduł `analytics/trends`):** średnia krocząca 7 i 30 dni, mediana, odchylenie standardowe,
z-score względem osobistej bazy (mediana + IQR, odporne na wartości skrajne), zmiana procentowa,
porównanie okres-do-okresu (ostatnie N dni vs poprzednie N dni), detekcja anomalii jako „wartość
odbiegająca od Twojej typowej” (|z| > 2), zawsze z liczbą dni danych.

**Korelacje (moduł `analytics/correlations`):** współczynnik **Spearmana** (rangowy — odporny na
nieliniowość i skale porządkowe 1–10), analiza par z opóźnieniem 0 i +1 dzień (noc → następny dzień)
oraz porównania warunkowe (dni poniżej/powyżej progu). Reguły:
- minimum **14 dni** wspólnych obserwacji, żeby cokolwiek pokazać; oznaczenie „wstępne” dla n < 30,
- zawsze widoczne: n, kierunek, siła (słaba/umiarkowana/wyraźna) i zdanie
  **„Korelacja nie oznacza przyczynowości”**,
- brak automatycznego „rankingu przyczyn”, brak wniosków; korelacje są opisane jako hipotezy do
  weryfikacji (m.in. dlatego, że przy wielu porównywanych parach część zależności pojawia się losowo).

Pary analizowane w MVP: sen↔energia, sen↔rozdrażnienie, HRV↔stres, RHR↔regeneracja, kofeina (ilość i
godzina)↔sen, alkohol↔sen i↔HRV, trening↔samopoczucie następnego dnia, kroki↔energia, sen↔jasność
umysłu.

---

## 9. Prywatność i bezpieczeństwo danych

- **Brak backendu, brak konta, brak logowania.** Aplikacja nie ma żadnego endpointu do wysyłki danych.
- **Zero telemetrii i reklam** — brak Google Analytics/Sentry/pixel/fontów z CDN. Pilnowane przez CSP
  (`default-src 'self'`) i test CI, który wykrywa w bundlu odwołania do zewnętrznych hostów.
- **Gdzie są dane:** wariant PWA — IndexedDB w profilu przeglądarki na telefonie; wariant APK —
  prywatny katalog aplikacji (niedostępny dla innych aplikacji). Dokument `docs/PRIVACY.md` opisze to
  wprost, wraz z tym, co się dzieje przy „wyczyść dane przeglądarki”/odinstalowaniu.
- **Backup:** jeden plik `.hth.json` (pełny zrzut bazy + wersja schematu), opcjonalnie szyfrowany hasłem
  (WebCrypto, AES-GCM, PBKDF2). Restore z podglądem i wyborem trybu (scal / zastąp).
- **Trwałość:** `navigator.storage.persist()` w PWA + przypomnienie o backupie (np. co 30 dni) + jasna
  informacja, że kopia w chmurze to decyzja użytkownika (aplikacja nigdy nie wysyła nic sama).
- **Eksport i usuwanie:** pełny eksport danych w każdej chwili; „usuń wszystkie dane” usuwa bazę
  nieodwracalnie, z dwustopniowym potwierdzeniem i propozycją backupu przed usunięciem.
- **Eksport do AI jest świadomym działaniem użytkownika:** przed skopiowaniem raportu pokazujemy
  jednorazowe (wyłączalne) przypomnienie, że wklejenie danych do zewnętrznej usługi AI oznacza
  przekazanie ich tej usłudze.

---

## 10. Plan MVP — etapy (po każdym etapie: lint + typecheck + testy)

| Etap | Zakres | Kryterium ukończenia |
|---|---|---|
| 0 | Szkielet: Vite + TS strict + Tailwind, struktura katalogów, Vitest + Playwright, GitHub Actions | CI zielone na pustej aplikacji |
| 1 | `data/`: schemat Dexie, migracje, repozytoria, journal `revisions`, seed katalogu badań | testy jednostkowe repozytoriów + testy journala (edycja nie gubi historii) |
| 2 | Daily Check-in + autosave + edycja dnia przeszłego + kalendarz historii | E2E: pełny check-in < 60 s ścieżką „happy path”, pominięcie dowolnego pola |
| 3 | Pomiary okresowe + harmonogramy | testy harmonogramu („następny pomiar za N dni”), E2E dodania pomiaru |
| 4 | Badania laboratoryjne: katalog (+własne parametry), dodawanie wyników, lista, ekran parametru | testy niezmienności historii przy zmianie katalogu/zakresów |
| 5 | `analytics/`: trendy, mediany, z-score, porównania okresów, korelacje Spearmana, progi danych | testy na zestawach syntetycznych + test „brak korelacji przy n < 14” |
| 6 | Dashboard: sekcje A–E, zakresy 7/30/90/180/365, wykresy | E2E przełączania zakresów, test „brak danych” (puste stany) |
| 7 | Import: CSV/JSON, kreator mapowania, presety Huawei (JSON z eksportu) i CSV laboratoryjny, batch + undo | testy parserów na plikach-próbkach, test podwójnego importu (hash), test wycofania batcha |
| 8 | Eksport: JSON, CSV, raport Markdown dla AI, wybór zakresu | testy snapshot raportu + test „brak języka diagnostycznego” |
| 9 | Backup/restore (opcjonalne szyfrowanie), „usuń wszystkie dane”, ustawienia, jedno przypomnienie | test round-trip backup → restore = identyczna baza |
| 10 | PWA: manifest, offline shell, ikony; `docs/PRIVACY.md`; opcjonalnie Capacitor + workflow budujący APK | instalacja na Androidzie, działanie w trybie offline |
| 11 (po MVP) | OCR wyników z PDF/zdjęcia (z obowiązkową weryfikacją), adapter Health Connect (jeśli pojawi się sensowna droga danych Huawei) | — |

Poza MVP i poza zakresem projektu: konta użytkowników, społeczność, gamifikacja, reklamy, rozbudowane
powiadomienia, AI wewnątrz aplikacji.

---

## 11. Ryzyka techniczne

| Ryzyko | Wpływ | Ograniczenie |
|---|---|---|
| **Huawei: brak oficjalnej integracji z Health Connect** | brak automatycznego strumienia snu/HRV | MVP oparte na oficjalnym eksporcie plików; adapter źródła gotowy na podmianę |
| **Struktura JSON w eksporcie Huawei jest niedokumentowana i zmienna między wersjami aplikacji** | parser może przestać działać po aktualizacji Huawei Health | parser oparty na mapowaniu (nie na sztywnym schemacie) + kreator mapowania + testy na próbkach z Twojego realnego eksportu; import zawsze z podglądem przed zapisem |
| **ZIP z eksportu jest zaszyfrowany hasłem użytkownika** | dodatkowy krok przy imporcie | obsługa hasła lokalnie lub instrukcja rozpakowania i wskazania plików JSON |
| **Health Kit wymaga zatwierdzenia aplikacji i zakresów przez Huawei** | ryzyko braku dostępu | świadomie nieużywane w MVP; wyłącznie opcja przyszła |
| **Semantyka faz snu u Huawei (deep/REM/light) nie jest kliniczną polisomnografią** | nadinterpretacja | dane oznaczane źródłem; raport zawiera zdanie o pochodzeniu i ograniczeniach danych |
| **Usunięcie danych przeglądarki (wariant PWA) = utrata bazy** | krytyczne przy 6–12 mies. danych | `storage.persist()`, cykliczne przypomnienie o backupie, etap Capacitor (APK z prywatnym storage) |
| **Migracje schematu przez wiele lat** | ryzyko utraty/zniekształcenia danych | wersjonowane migracje Dexie + test „migracja z każdej poprzedniej wersji na zestawie danych” + automatyczny backup przed migracją |
| **Strefy czasowe i zmiana czasu przy godzinach snu** | błędne długości snu | znaczniki ISO z offsetem, dzień = data wybudzenia, testy na przejściach DST |
| **Niespójne jednostki i zakresy między laboratoriami** (np. ng/mL vs pmol/L) | błędne porównania w czasie | jednostka i zakres zapisywane przy wyniku; rejestr konwersji świadomy i jawny; domyślnie **brak** automatycznej konwersji, ostrzeżenie „inna jednostka niż w poprzednim wyniku” |
| **Nadinterpretacja korelacji (wiele par, mało dni)** | fałszywe wnioski | progi n ≥ 14 / 30, oznaczenie „wstępne”, brak rankingu przyczyn, stała nota o braku przyczynowości |
| **OCR wyników badań** | ryzyko zapisania błędnej liczby | poza MVP; obowiązkowy przegląd i zatwierdzenie każdej wartości |
| **Środowisko dev bez Android SDK/emulatora** | niemożność weryfikacji buildu natywnego tutaj | stack web-first (pełne testy tutaj) + build APK w GitHub Actions jako artefakt |

---

## 12. Decyzje, które proszę o potwierdzenie

1. **Stack:** PWA (React + TS + Dexie) z późniejszym opakowaniem w APK (Capacitor) — czy zamiast tego
   natywny Kotlin + Compose + Room (wymaga Twojego Android Studio do buildów i testów UI)?
2. **Codzienne minimum:** które metryki subiektywne mają być domyślnie widoczne w check-inie
   (proponuję 5: energia, stres, rozdrażnienie, regeneracja, nastrój; jasność umysłu pod „więcej”)?
3. **Kofeina:** liczymy porcje (kawa/herbata/energetyk z konfigurowalnym mg) czy wpisujesz mg wprost?
4. **Huawei:** czy możesz wykonać jeden eksport danych (Privacy center → Request your data) i wskazać
   nazwy plików/kluczy? To pozwoli zbudować preset mapowania na Twoich realnych danych, a nie na
   założeniach.
5. **Język interfejsu:** polski, angielski, czy oba (raport dla AI proponuję po angielsku — lepiej
   działa w analizie, nazwy pól są ustandaryzowane)?
6. **Backup:** czy chcesz od razu opcjonalne szyfrowanie pliku backupu hasłem?

---

## Źródła (weryfikacja stanu integracji Huawei, sierpień 2026)

- Huawei Health i Health Connect — brak oficjalnej synchronizacji, obejścia przez aplikacje-pomosty:
  https://www.fitmesh.fit/en/blog/huawei-health-health-connect-sync
- Health Sync (aplikacja-pomost, obsługa Huawei Health): https://healthsync.app/about/
- Eksport danych z Huawei Health (Privacy center → Request your data; zaszyfrowany ZIP z plikami JSON):
  https://github.com/CTHRU/Hitrava oraz
  https://github.com/aricooperdavis/Huawei-TCX-Converter/issues/19
- Huawei Health Kit — wymóg konta developerskiego, weryfikacji i zatwierdzenia zakresów danych:
  https://developer.huawei.com/consumer/en/doc/auth-example-0000001054581058 oraz
  https://developer.huawei.com/consumer/en/hms/huaweihealth/
