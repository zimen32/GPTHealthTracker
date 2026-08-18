# Prywatność: gdzie są Twoje dane

Aplikacja jest zaprojektowana tak, aby dane zdrowotne nie opuszczały urządzenia.

## Co dokładnie dzieje się z danymi

| Element | Stan |
|---|---|
| Serwer aplikacji | **brak** - nie ma backendu, konta ani logowania |
| Wysyłanie danych na zewnątrz | **brak** - w czasie działania aplikacja nie wykonuje żadnych żądań sieciowych |
| Analityka, telemetria, reklamy | **brak** - żadnego Google Analytics, Sentry, pikseli ani zewnętrznych czcionek |
| Miejsce przechowywania | IndexedDB w profilu przeglądarki na Twoim urządzeniu (baza `health-tracker`) |
| Pliki importu | czytane lokalnie w przeglądarce, nigdzie nie wysyłane |
| Eksport i kopia zapasowa | plik generowany lokalnie i zapisywany tam, gdzie sam wskażesz |

Jedyny moment, w którym dane mogą opuścić urządzenie, to Twoja świadoma decyzja: skopiowanie raportu
i wklejenie go do zewnętrznej usługi AI albo przekazanie pliku eksportu komuś innemu. Aplikacja nigdy
nie robi tego sama.

## Trwałość danych

Dane żyją w pamięci przeglądarki. Oznacza to dwie rzeczy:

1. Aplikacja przy starcie prosi przeglądarkę o trwałe przechowywanie (`navigator.storage.persist()`),
   co ogranicza automatyczne czyszczenie danych przy braku miejsca.
2. **Wyczyszczenie danych przeglądarki lub odinstalowanie aplikacji z ekranu głównego usuwa również te
   dane.** Dlatego warto co jakiś czas pobrać kopię zapasową (Ustawienia → Kopia zapasowa).

Kopia zapasowa to jeden plik JSON zawierający wszystko: wpisy dzienne, pomiary, wyniki badań, katalog
parametrów, zapisane mapowania importu, ustawienia i dziennik zmian. Plik nie jest szyfrowany - trzymaj
go w miejscu, które sam uznasz za bezpieczne.

## Usunięcie danych

Ustawienia → Usunięcie danych → „Usuń wszystkie dane". Operacja jest nieodwracalna i czyści całą bazę na
urządzeniu (aplikacja proponuje wcześniej pobranie kopii). Po usunięciu zostaje tylko katalog startowy
parametrów laboratoryjnych.

## Historia zmian zamiast nadpisywania

Każda zmiana wpisu (dziennego, pomiaru, wyniku badania) zapisuje w tabeli `revisions` stan przed i po
zmianie razem ze znacznikiem czasu. Nic nie jest nadpisywane bezśladowo, a poprawienie błędnej wartości
nie usuwa informacji, że wpis był poprawiany. Wyniki badań przechowują jednostkę i zakres referencyjny
laboratorium z dnia badania - późniejsza zmiana zakresów nie modyfikuje historii.

## Czego aplikacja nie robi

Nie diagnozuje, nie ocenia stanu zdrowia i nie generuje zaleceń. Pokazuje zebrane dane, ich trendy,
odchylenia od Twojej własnej normy i potencjalne zależności statystyczne - zawsze z liczbą dni, na
których są policzone, i z zastrzeżeniem, że korelacja nie oznacza przyczynowości.
