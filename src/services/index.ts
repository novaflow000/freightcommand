import { fetchCanonicalShipments, fetchCanonicalAnalytics, fetchCanonicalAlerts, searchCanonical } from './canonical';
import { Filters } from '../context/FiltersContext';

export const ShipmentService = {
  list: (filters: Filters) => fetchCanonicalShipments(filters),
};

export const AnalyticsService = {
  overview: () => fetchCanonicalAnalytics(),
};

export const AlertService = {
  list: () => fetchCanonicalAlerts(),
};

export const SearchService = {
  search: (q: string) => searchCanonical(q),
};

export const RouteService = {
  list: (filters: Filters) => fetchCanonicalShipments(filters).then(rows => rows.map(r => r.route)),
};

export const ContainerService = {
  list: (filters: Filters) => fetchCanonicalShipments(filters).then(rows => rows.flatMap((r) => r.containers || [])),
};

export const EventService = {
  list: (filters: Filters) => fetchCanonicalShipments(filters).then(rows => rows.flatMap((r) => r.events || [])),
};

export const CarrierService = {
  list: (filters: Filters) => fetchCanonicalShipments(filters).then(rows => rows.map((r) => r.carrier)),
};
