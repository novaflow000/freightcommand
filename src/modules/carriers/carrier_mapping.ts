export const carrierSCACMap: Record<string, string> = {
  'MSC': 'MSCU',
  'Maersk': 'MAEU',
  'CMA CGM': 'CMDU',
  'Hapag-Lloyd': 'HLCU',
  'COSCO': 'COSU',
  'Evergreen': 'EGLV',
  'ONE': 'ONEY',
  'Yang Ming': 'YMLU',
  'ZIM': 'ZIMU',
  'HMM': 'HDMU',
  'PIL': 'PILU',
  'Wan Hai': 'WHLC',
  'OOCL': 'OOLU',
  'Matson': 'MATS',
  'Seaboard Marine': 'SMLU',
  'Hamburg Süd': 'SUDU',
  'Sinokor': 'SNKO',
  'TS Lines': 'TSLU',
  'KMTC': 'KMTC',
  'SITC': 'SITC',
  'Gold Star Line': 'GSLU',
  'Ark Shipping': 'ARKU',
  'Unifeeder': 'UNFE',
};

export function normalizeCarrier(carrierName: string | undefined | null): string {
  if (!carrierName) return '';
  return carrierSCACMap[carrierName] || carrierName;
}
