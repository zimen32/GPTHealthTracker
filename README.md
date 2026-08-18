# Health Tracker

Prywatna, offline-first aplikacja do wieloletniego monitorowania snu, regeneracji, samopoczucia, stylu
życia, pomiarów ciała i wyników badań laboratoryjnych - z eksportem danych do analizy przez zewnętrznego
asystenta AI.

**To nie jest aplikacja medyczna.** Nie diagnozuje, nie ocenia stanu zdrowia i nie generuje zaleceń.
Przechowuje dane, pokazuje trendy i odchylenia od Twojej własnej normy oraz przygotowuje zestawienia do
rozmowy z lekarzem lub dalszej analizy.

## Co jest w środku

- **Daily Check-in** - jeden ekran, 30-60 sekund, każde pole opcjonalne, wartości podpowiadane z ostatnich
  7 dni, suwak nietknięty = brak danych (nigdy zero), autosave i jawny zapis.
- **Historia** - kalendarz z oznaczeniem kompletności dni, uzupełnianie i poprawianie danych wstecz.
- **Trendy** - sekcje regeneracja / samopoczucie / aktywność / ciało / badania, zakresy 7, 30, 90, 180 i
  365 dni, wykresy z średnią kroczącą 7 i 30 dni, zawsze z liczbą dni, na których policzono wartość.
- **Zależności** - zmiany okres-do-okresu, odchylenia od osobistej normy (mediana + IQR), korelacje
  rangowe Spearmana z progiem 14 dni danych, porównania warunkowe (np. dni ze snem poniżej progu),
  raport kompletności danych. Wszędzie widoczne: korelacja nie oznacza przyczynowości.
- **Badania laboratoryjne** - katalog ~45 parametrów + własne parametry, wiele wyników tego samego
  parametru w czasie, wykres z pasmem zakresu referencyjnego, jednostka i zakres zapisywane razem
  z wynikiem (zmiana katalogu nie rusza historii).
- **Pomiary okresowe** - masa, obwody, ciśnienie, tętno spoczynkowe, z konfigurowalną częstotliwością;
  przypomnienie pojawia się w check-inie tylko wtedy, gdy termin faktycznie minął.
- **Import** - CSV/JSON z kreatorem mapowania kolumn, automatyczna propozycja mapowania, podgląd
  z podziałem na nowe / uzupełnienia / konflikty / błędne wiersze, zapisywane mapowania.
- **Eksport do analizy AI** - raport Markdown gotowy do wklejenia w ChatGPT/Claude, JSON z wersjonowanym
  schematem, pliki CSV; zakresy 7/30/90 dni, od ostatnich badań lub własny.
- **Kopia zapasowa / przywracanie / usunięcie wszystkich danych.**

Szczegóły projektowe: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Gdzie są dane i co ich nie opuszcza: [`docs/PRIVACY.md`](docs/PRIVACY.md).

## Stack

React 19 + TypeScript + Vite, Dexie (IndexedDB) jako lokalna baza, Recharts, Tailwind CSS, PWA
(offline). **Brak backendu, kont, telemetrii i reklam** - aplikacja nie wykonuje żadnych żądań
sieciowych w czasie działania.

## Uruchomienie

```bash
npm install
npm run dev        # tryb developerski
npm run build      # typecheck + produkcyjny build do dist/
npm run preview    # serwowanie builda lokalnie
```

## Instalacja na Androidzie

1. `npm run build` i udostępnij katalog `dist/` przez HTTPS (dowolny statyczny hosting lub własny serwer;
   dane i tak zostają w przeglądarce urządzenia).
2. Otwórz adres w Chrome na telefonie → menu → „Dodaj do ekranu głównego".
3. Aplikacja działa offline, w trybie pełnoekranowym, a dane trzyma lokalnie.

Dane żyją w pamięci przeglądarki, więc **czyszczenie danych przeglądarki je usuwa** - warto co jakiś czas
pobrać kopię zapasową z Ustawień.

## Testy

```bash
npm test           # testy jednostkowe (Vitest): baza, analityka, raporty, import, kopia zapasowa
npm run e2e        # testy E2E w przeglądarce (Playwright): check-in, badania, eksport, backup
npm run lint       # oxlint
```

## Struktura

```
src/
  domain/      typy encji, katalog badań i pomiarów
  data/        Dexie: schemat, repozytoria, dziennik zmian, kopia zapasowa
  analytics/   metryki, trendy, korelacje, kompletność danych (czyste funkcje)
  reporting/   eksport: raport Markdown, JSON, CSV
  importing/   parsery CSV/JSON, mapowanie kolumn, podglądy importu
  features/    ekrany: checkin, history, dashboard, insights, labs, measurements, importing, export, settings
  components/  komponenty UI i wykresy
  lib/         daty, statystyka, pliki, normalizacja tekstu
```
