import type { LabCategory, LabTest, MeasurementType } from './types'

export const LAB_CATEGORY_LABELS: Record<LabCategory, string> = {
  cbc: 'Morfologia',
  metabolic: 'Metabolizm',
  lipids: 'Lipidy',
  liver: 'Watroba',
  thyroid: 'Tarczyca',
  iron: 'Zelazo',
  vitamins: 'Witaminy',
  inflammation: 'Stan zapalny',
  urine: 'Mocz',
  other: 'Inne',
}

/**
 * Katalog startowy parametrow. Jednostki to typowe jednostki polskich laboratoriow -
 * uzytkownik moze je nadpisac przy kazdym wyniku, bo jednostka jest zapisywana razem z wynikiem.
 */
export const LAB_CATALOG: LabTest[] = [
  // morfologia
  { key: 'hemoglobin', name: 'Hemoglobina (HGB)', category: 'cbc', defaultUnit: 'g/dl' },
  { key: 'hematocrit', name: 'Hematokryt (HCT)', category: 'cbc', defaultUnit: '%' },
  { key: 'rbc', name: 'Erytrocyty (RBC)', category: 'cbc', defaultUnit: 'mln/ul' },
  { key: 'wbc', name: 'Leukocyty (WBC)', category: 'cbc', defaultUnit: 'tys./ul' },
  { key: 'platelets', name: 'Plytki krwi (PLT)', category: 'cbc', defaultUnit: 'tys./ul' },
  { key: 'mcv', name: 'MCV', category: 'cbc', defaultUnit: 'fl' },
  { key: 'mch', name: 'MCH', category: 'cbc', defaultUnit: 'pg' },
  { key: 'mchc', name: 'MCHC', category: 'cbc', defaultUnit: 'g/dl' },
  { key: 'rdw', name: 'RDW', category: 'cbc', defaultUnit: '%' },
  { key: 'neutrophils', name: 'Neutrofile', category: 'cbc', defaultUnit: '%' },
  { key: 'lymphocytes', name: 'Limfocyty', category: 'cbc', defaultUnit: '%' },
  { key: 'monocytes', name: 'Monocyty', category: 'cbc', defaultUnit: '%' },
  { key: 'eosinophils', name: 'Eozynofile', category: 'cbc', defaultUnit: '%' },
  { key: 'basophils', name: 'Bazofile', category: 'cbc', defaultUnit: '%' },
  // metabolizm
  { key: 'glucose', name: 'Glukoza', category: 'metabolic', defaultUnit: 'mg/dl' },
  { key: 'hba1c', name: 'HbA1c', category: 'metabolic', defaultUnit: '%' },
  { key: 'creatinine', name: 'Kreatynina', category: 'metabolic', defaultUnit: 'mg/dl' },
  { key: 'egfr', name: 'eGFR', category: 'metabolic', defaultUnit: 'ml/min/1,73m2' },
  { key: 'sodium', name: 'Sod', category: 'metabolic', defaultUnit: 'mmol/l' },
  { key: 'potassium', name: 'Potas', category: 'metabolic', defaultUnit: 'mmol/l' },
  { key: 'calcium', name: 'Wapn', category: 'metabolic', defaultUnit: 'mg/dl' },
  { key: 'magnesium', name: 'Magnez', category: 'metabolic', defaultUnit: 'mg/dl' },
  // lipidy
  { key: 'total_cholesterol', name: 'Cholesterol calkowity', category: 'lipids', defaultUnit: 'mg/dl' },
  { key: 'ldl', name: 'LDL', category: 'lipids', defaultUnit: 'mg/dl' },
  { key: 'hdl', name: 'HDL', category: 'lipids', defaultUnit: 'mg/dl' },
  { key: 'triglycerides', name: 'Trojglicerydy', category: 'lipids', defaultUnit: 'mg/dl' },
  { key: 'lp_a', name: 'Lp(a)', category: 'lipids', defaultUnit: 'mg/dl' },
  // watroba
  { key: 'alt', name: 'ALT', category: 'liver', defaultUnit: 'U/l' },
  { key: 'ast', name: 'AST', category: 'liver', defaultUnit: 'U/l' },
  { key: 'ggtp', name: 'GGTP', category: 'liver', defaultUnit: 'U/l' },
  { key: 'bilirubin_total', name: 'Bilirubina calkowita', category: 'liver', defaultUnit: 'mg/dl' },
  // tarczyca
  { key: 'tsh', name: 'TSH', category: 'thyroid', defaultUnit: 'mIU/l' },
  { key: 'ft4', name: 'FT4', category: 'thyroid', defaultUnit: 'pmol/l' },
  // zelazo
  { key: 'ferritin', name: 'Ferrytyna', category: 'iron', defaultUnit: 'ng/ml' },
  { key: 'iron', name: 'Zelazo', category: 'iron', defaultUnit: 'ug/dl' },
  { key: 'tibc', name: 'TIBC', category: 'iron', defaultUnit: 'ug/dl' },
  { key: 'uibc', name: 'UIBC', category: 'iron', defaultUnit: 'ug/dl' },
  { key: 'transferrin', name: 'Transferyna', category: 'iron', defaultUnit: 'mg/dl' },
  // witaminy
  { key: 'b12', name: 'Witamina B12', category: 'vitamins', defaultUnit: 'pg/ml' },
  { key: 'folate', name: 'Kwas foliowy', category: 'vitamins', defaultUnit: 'ng/ml' },
  { key: 'vitamin_d_25oh', name: 'Witamina D (25-OH)', category: 'vitamins', defaultUnit: 'ng/ml' },
  // stan zapalny
  { key: 'crp', name: 'CRP', category: 'inflammation', defaultUnit: 'mg/l' },
  // mocz
  { key: 'urinalysis', name: 'Badanie ogolne moczu', category: 'urine', defaultUnit: '-', textual: true },
].map((t, i) => ({ ...t, sortOrder: i, isCustom: false }) as LabTest)

export const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  body_weight: 'Masa ciala',
  waist: 'Talia',
  chest: 'Klatka piersiowa',
  arm: 'Ramie',
  thigh: 'Udo',
  calf: 'Lydka',
  blood_pressure: 'Cisnienie krwi',
  resting_heart_rate: 'Tetno spoczynkowe',
}

export const MEASUREMENT_UNITS: Record<MeasurementType, string> = {
  body_weight: 'kg',
  waist: 'cm',
  chest: 'cm',
  arm: 'cm',
  thigh: 'cm',
  calf: 'cm',
  blood_pressure: 'mmHg',
  resting_heart_rate: 'bpm',
}

/** Domyslne czestotliwosci - swiadomie rzadkie, aplikacja nie wymaga codziennych pomiarow. */
export const DEFAULT_SCHEDULES: Array<{ type: MeasurementType; intervalDays: number; enabled: boolean }> = [
  { type: 'body_weight', intervalDays: 7, enabled: true },
  { type: 'waist', intervalDays: 30, enabled: true },
  { type: 'blood_pressure', intervalDays: 14, enabled: true },
  { type: 'resting_heart_rate', intervalDays: 30, enabled: false },
  { type: 'chest', intervalDays: 90, enabled: false },
  { type: 'arm', intervalDays: 90, enabled: false },
  { type: 'thigh', intervalDays: 90, enabled: false },
  { type: 'calf', intervalDays: 90, enabled: false },
]

export const SCORE_LABELS: Record<string, string> = {
  energy: 'Energia',
  stress: 'Stres',
  irritability: 'Rozdraznienie',
  recovery: 'Regeneracja',
  mood: 'Nastroj',
  clarity: 'Jasnosc umyslu',
}
