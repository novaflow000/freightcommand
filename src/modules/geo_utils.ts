// Shared geo helpers for deriving plausible vessel positions between ports.
// Keep the port list lightweight; add more as needed.

export const PORT_COORDINATES: Record<string, [number, number]> = {
  'Shanghai': [31.2304, 121.4737],
  'Singapore': [1.3521, 103.8198],
  'Rotterdam': [51.9244, 4.4777],
  'Los Angeles': [34.0522, -118.2437],
  'Long Beach': [33.7701, -118.1937],
  'New York': [40.7128, -74.0060],
  'Hamburg': [53.5511, 9.9937],
  'Antwerp': [51.2194, 4.4025],
  'Casablanca': [33.5731, -7.5898],
  'Jorf Lasfar': [33.1167, -8.6167],
  'Tanger Med': [35.8833, -5.5],
  'Mohammedia': [33.6835, -7.3843],
  'Shenzhen': [22.5431, 114.0579],
  'Ningbo': [29.8683, 121.5440],
  'Busan': [35.1796, 129.0756],
  'Qingdao': [36.0671, 120.3826],
  'Tianjin': [39.3434, 117.3616],
  'Dubai': [25.2048, 55.2708],
  'Jebel Ali': [24.9857, 55.0273],
  'Port Klang': [3.0, 101.4],
  'Kaohsiung': [22.6273, 120.3014],
  'Xiamen': [24.4798, 118.0894],
  'Dalian': [38.9140, 121.6147],
  'Tanjung Pelepas': [1.3667, 103.55],
  'Laem Chabang': [13.0833, 100.9167],
  'Mundra': [22.8333, 69.7],
  'Nhava Sheva': [18.95, 72.95],
  'Colombo': [6.9271, 79.8612],
  'Salalah': [17.0167, 54.1],
  'Algeciras': [36.1333, -5.45],
  'Valencia': [39.4699, -0.3763],
  'Barcelona': [41.3851, 2.1734],
  'Genoa': [44.4056, 8.9463],
  'Piraeus': [37.9429, 23.6469],
  'Marsaxlokk': [35.8333, 14.55],
  'Santos': [-23.9540, -46.3336],
  'Manzanillo': [19.0533, -104.3150],
  'Savannah': [32.0809, -81.0912],
  'Houston': [29.7604, -95.3698],
  'Le Havre': [49.4944, 0.1079],
  'Antalya': [36.8969, 30.7133],
  'Abidjan': [5.3097, -4.0127],
};

const toKey = (name?: string) => (name || '').trim().toLowerCase();

export function getPortCoordinates(name?: string): [number, number] | null {
  if (!name) return null;
  const key = toKey(name);
  const entry = Object.entries(PORT_COORDINATES).find(
    ([port]) => port.toLowerCase() === key,
  );
  return entry ? entry[1] : null;
}

// Deterministic hash -> 0..1
const hashToUnit = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (h % 10000) / 10000;
};

/**
 * Derive a plausible mid-route position between two ports.
 * Returns null if either port is unknown.
 */
export function deriveInTransitLocation(
  origin: string,
  destination: string,
  seed: string,
): { lat: number; lng: number } | null {
  const from = getPortCoordinates(origin);
  const to = getPortCoordinates(destination);
  if (!from || !to) return null;

  const base = hashToUnit(seed);
  // Keep vessels off the quays: between 20% and 80% of the route
  const t = 0.2 + base * 0.6;
  const lat = from[0] + (to[0] - from[0]) * t;
  const lng = from[1] + (to[1] - from[1]) * t;

  // Small perpendicular offset to nudge off land
  const dx = to[1] - from[1];
  const dy = to[0] - from[0];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const offsetMag = (base - 0.5) * 1.2; // ±0.6 degrees
  const offLat = lat + (-dx / len) * offsetMag;
  const offLng = lng + (dy / len) * offsetMag;

  return { lat: offLat, lng: offLng };
}
