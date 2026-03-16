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

/** ISO 6346: 4 letters (owner+equip) + 7 digits (serial+check). Valid container format for ShipsGo etc. */
export function looksLikeContainerNumber(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false;
  const s = value.replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{4}\d{7}$/.test(s);
}

/** When reference may be booking/BL rather than container, choose how to send to ShipsGo. */
export function buildShipsGoCreatePayload(job: {
  bl_number?: string;
  container_number?: string;
  booking_number?: string;
  carrier?: string;
}): { container_number?: string; bl_number?: string; booking_number?: string; reference: string; carrier: string } {
  const carrierCode = normalizeCarrier(job.carrier || '');
  const reference = job.bl_number || job.booking_number || job.container_number || '';
  const hasExplicitBooking = !!(job.booking_number || job.bl_number);

  if (hasExplicitBooking) {
    const bookingNum = job.booking_number || job.bl_number;
    return {
      container_number: job.container_number && looksLikeContainerNumber(job.container_number) ? job.container_number : undefined,
      bl_number: job.bl_number || undefined,
      booking_number: bookingNum || undefined,
      reference,
      carrier: carrierCode,
    };
  }
  // Only container_number provided (or as fallback)
  const cn = job.container_number || '';
  if (looksLikeContainerNumber(cn)) {
    return {
      container_number: cn,
      bl_number: job.bl_number || undefined,
      booking_number: job.booking_number || undefined,
      reference,
      carrier: carrierCode,
    };
  }
  // Value doesn't match container format → treat as booking_number (e.g. CSA0418719)
  return {
    container_number: undefined,
    bl_number: job.bl_number || undefined,
    booking_number: cn || undefined,
    reference,
    carrier: carrierCode,
  };
}

/** Normalize injection input: put booking refs (e.g. CSA0418719) in booking_number, not container_number. */
export function normalizeInjectedInput(body: {
  bl_number?: string;
  container_number?: string;
  booking_number?: string;
}): { bl_number?: string; container_number?: string; booking_number?: string } {
  const bn = (body.booking_number || '').trim();
  const cn = (body.container_number || '').trim();
  const bl = (body.bl_number || '').trim();

  if (bn) {
    return { booking_number: bn, bl_number: bl || bn, container_number: looksLikeContainerNumber(cn) ? cn : '' };
  }
  if (cn && !looksLikeContainerNumber(cn)) {
    return { booking_number: cn, bl_number: bl || cn, container_number: '' };
  }
  return {};
}
