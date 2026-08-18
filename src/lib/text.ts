/** Normalizacja tekstu do porownan: male litery bez polskich znakow diakrytycznych. */
const PL_MAP: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
}

/** Zamienia polskie znaki na odpowiedniki ASCII (l zamiast ł itd.). */
export function deaccent(text: string): string {
  return text
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => PL_MAP[c] ?? c)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/** Klucz do porownan nazw kolumn i parametrów: bez wielkości liter, bez diakrytykow, bez separatorow. */
export function normalizeKey(text: string): string {
  return deaccent(text).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}
