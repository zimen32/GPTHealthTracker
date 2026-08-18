import { expect, test } from '@playwright/test'

/**
 * Testy przechodza przez realna aplikację w przeglądarce: zapis check-inu, wynik badania
 * i wygenerowanie raportu dla AI. Każdy test startuje z czysta baza.
 */

test.beforeEach(async ({ page }) => {
  // skrypt startowy uruchamia się przy kazdym ladowaniu strony, więc czyscimy baze tylko raz na test -
  // inaczej reload w tescie wymazywalby właśnie zapisane dane
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-db-wiped')) {
      indexedDB.deleteDatabase('health-tracker')
      sessionStorage.setItem('e2e-db-wiped', '1')
    }
  })
})

test('daily check-in zapisuje częściowe dane i pozwala pominąć dowolne pole', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dzisiaj' })).toBeVisible()

  // energia: jeden gest suwakiem
  const energy = page.getByRole('slider', { name: 'Energia' })
  await energy.fill('7')
  await expect(page.getByText('7/10')).toBeVisible()

  // sen: dwie godziny, długość wylicza się sama
  await page.getByLabel('Zaśnięcie').fill('23:40')
  await page.getByLabel('Wybudzenie').fill('06:20')
  await expect(page.getByText('6 h 40 min')).toBeVisible()

  await page.getByLabel('Kroki').fill('8200')
  await page.getByRole('button', { name: 'Kofeina więcej' }).click()
  await page.getByRole('button', { name: 'Kofeina więcej' }).click()

  await page.getByRole('button', { name: 'Zapisz dzień' }).click()
  await expect(page.getByText(/Zapisano/)).toBeVisible()

  // dane są trwale po przeladowaniu
  await page.reload()
  await expect(page.getByRole('slider', { name: 'Energia' })).toHaveValue('7')
  await expect(page.getByLabel('Kroki')).toHaveValue('8200')
  await expect(page.getByText('6 h 40 min')).toBeVisible()
})

test('pominięte pola nie są zapisywane jako zero', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('slider', { name: 'Stres' }).fill('6')
  await page.getByRole('button', { name: 'Zapisz dzień' }).click()
  await expect(page.getByText(/Zapisano/)).toBeVisible()

  const stored = await page.evaluate(async () => {
    const req = indexedDB.open('health-tracker')
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const tx = db.transaction('daily', 'readonly')
    const all: unknown[] = await new Promise((resolve, reject) => {
      const r = tx.objectStore('daily').getAll()
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    return all[0] as Record<string, unknown>
  })

  expect(stored.stress).toBe(6)
  expect(stored.energy).toBeUndefined()
  expect(stored.steps).toBeUndefined()
})

test('wynik badania zapisuje jednostkę i zakres laboratorium', async ({ page }) => {
  await page.goto('/#/badania')
  await page.getByRole('button', { name: '+ Wynik' }).click()

  await page.getByLabel('Parametr').selectOption('ferritin')
  await page.getByLabel('Wartość').fill('38')
  await page.getByLabel('Zakres od').fill('30')
  await page.getByLabel('Zakres do').fill('400')
  await page.getByLabel('Laboratorium').fill('Lab X')
  await page.getByRole('button', { name: 'Zapisz wynik' }).click()

  await expect(page.getByText('Wynik zapisany.')).toBeVisible()
  await expect(page.getByText('38 ng/ml').first()).toBeVisible()

  await page.getByRole('button', { name: /Ferrytyna/ }).first().click()
  await expect(page.getByText(/zakres laboratorium: 30-400 ng\/ml/)).toBeVisible()
  await expect(page.getByText('Lab X')).toBeVisible()
})

test('eksport dla AI generuje raport z wymaganymi sekcjami', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('slider', { name: 'Energia' }).fill('5')
  await page.getByLabel('Kroki').fill('7000')
  await page.getByRole('button', { name: 'Zapisz dzień' }).click()
  await expect(page.getByText(/Zapisano/)).toBeVisible()

  await page.goto('/#/eksport')
  await expect(page.getByRole('heading', { name: 'Eksport do analizy AI' })).toBeVisible()
  const report = page.locator('pre')
  await expect(report).toContainText('# Health Tracking Report')
  await expect(report).toContainText('## Sleep')
  await expect(report).toContainText('## Laboratory results')
  await expect(report).toContainText('## Missing data')
  await expect(report).toContainText('Korelacja nie oznacza przyczynowości.')

  // zmiana zakresu przelicza raport
  await page.getByRole('button', { name: 'ostatnie 7 dni' }).click()
  await expect(report).toContainText('7 dni')
})

test('kopia zapasowa i usunięcie danych działają z ekranu ustawień', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('slider', { name: 'Nastrój' }).fill('8')
  await page.getByRole('button', { name: 'Zapisz dzień' }).click()
  await expect(page.getByText(/Zapisano/)).toBeVisible()

  await page.goto('/#/ustawienia')
  await expect(page.getByText('Dni z wpisami').locator('..').getByText('1')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Pobierz kopię' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^health_backup_\d{4}-\d{2}-\d{2}\.json$/)

  await page.getByRole('button', { name: 'Usuń wszystkie dane' }).click()
  await page.getByRole('button', { name: 'Tak, usuń wszystko' }).click()
  await expect(page.getByText('Wszystkie dane zostaly usunięte z urządzenia.')).toBeVisible()
})
