-- Master data model for Freight Command (provider-agnostic, normalized)
-- Compatible with PostgreSQL; adjust types if using another RDBMS.

-- =======================
-- Reference tables
-- =======================

CREATE TABLE IF NOT EXISTS carriers (
  id                BIGSERIAL PRIMARY KEY,
  carrier_code      VARCHAR(10),
  carrier_name      VARCHAR(255) NOT NULL,
  carrier_country   VARCHAR(2),
  carrier_type      VARCHAR(20) CHECK (carrier_type IN ('ocean','air','rail','truck','other')),
  website           VARCHAR(255),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_carriers_code ON carriers (carrier_code);

CREATE TABLE IF NOT EXISTS ports (
  id              BIGSERIAL PRIMARY KEY,
  port_code       VARCHAR(10),
  port_name       VARCHAR(255) NOT NULL,
  country_code    VARCHAR(2),
  country_name    VARCHAR(100),
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  timezone        VARCHAR(50)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ports_code ON ports (port_code);
CREATE INDEX IF NOT EXISTS idx_ports_country ON ports (country_code);

-- =======================
-- Core entities
-- =======================

CREATE TABLE IF NOT EXISTS shipments (
  id                        BIGSERIAL PRIMARY KEY,
  shipment_reference        VARCHAR(255),
  booking_number            VARCHAR(50),
  bill_of_lading_number     VARCHAR(50),
  shipment_status           VARCHAR(50),
  container_count           INT,
  carrier_id                BIGINT REFERENCES carriers(id),
  origin_port_id            BIGINT REFERENCES ports(id),
  destination_port_id       BIGINT REFERENCES ports(id),
  departure_time            TIMESTAMPTZ,
  eta                       TIMESTAMPTZ,
  transit_days              INT,
  transit_progress_percent  INT,
  co2_emission              NUMERIC(12,2),
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  last_checked_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shipments_booking ON shipments (booking_number);
CREATE INDEX IF NOT EXISTS idx_shipments_bl ON shipments (bill_of_lading_number);

CREATE TABLE IF NOT EXISTS routes (
  id                   BIGSERIAL PRIMARY KEY,
  shipment_id          BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  origin_port_id       BIGINT REFERENCES ports(id),
  destination_port_id  BIGINT REFERENCES ports(id),
  departure_time       TIMESTAMPTZ,
  eta                  TIMESTAMPTZ,
  transit_days         INT,
  transshipment_count  INT
);

CREATE TABLE IF NOT EXISTS route_geometry (
  id              BIGSERIAL PRIMARY KEY,
  shipment_id     BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  latitude        NUMERIC(9,6) NOT NULL,
  longitude       NUMERIC(9,6) NOT NULL,
  sequence_order  INT NOT NULL,
  route_status    VARCHAR(10) CHECK (route_status IN ('past','current','future'))
);

CREATE INDEX IF NOT EXISTS idx_route_geom_ship_seq ON route_geometry (shipment_id, sequence_order);

CREATE TABLE IF NOT EXISTS vessels (
  id           BIGSERIAL PRIMARY KEY,
  vessel_name  VARCHAR(255),
  imo_number   VARCHAR(20),
  mmsi         VARCHAR(20),
  vessel_type  VARCHAR(50),
  flag_country VARCHAR(2)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vessels_imo ON vessels (imo_number);

CREATE TABLE IF NOT EXISTS containers (
  id               BIGSERIAL PRIMARY KEY,
  shipment_id      BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  container_number VARCHAR(20) NOT NULL,
  container_type   VARCHAR(50),
  container_size   VARCHAR(10),
  container_status VARCHAR(50),
  seal_number      VARCHAR(50),
  weight           NUMERIC(12,2),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_containers_number ON containers (container_number);
CREATE INDEX IF NOT EXISTS idx_containers_shipment ON containers (shipment_id);

CREATE TABLE IF NOT EXISTS events (
  id             BIGSERIAL PRIMARY KEY,
  shipment_id    BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  container_id   BIGINT REFERENCES containers(id) ON DELETE CASCADE,
  event_type     VARCHAR(50),
  event_status   VARCHAR(50),
  event_time     TIMESTAMPTZ,
  port_id        BIGINT REFERENCES ports(id),
  vessel_id      BIGINT REFERENCES vessels(id),
  voyage_number  VARCHAR(50),
  description    TEXT,
  source_provider VARCHAR(100),
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_shipment_time ON events (shipment_id, event_time);
CREATE INDEX IF NOT EXISTS idx_events_container_time ON events (container_id, event_time);

-- =======================
-- Providers & links
-- =======================

CREATE TABLE IF NOT EXISTS tracking_providers (
  id                  BIGSERIAL PRIMARY KEY,
  provider_name       VARCHAR(100) NOT NULL,
  provider_type       VARCHAR(50),
  api_base_url        VARCHAR(255),
  authentication_type VARCHAR(50),
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_shipment_links (
  id                        BIGSERIAL PRIMARY KEY,
  shipment_id               BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  provider_id               BIGINT NOT NULL REFERENCES tracking_providers(id) ON DELETE CASCADE,
  provider_shipment_id      VARCHAR(255),
  provider_reference        VARCHAR(255),
  provider_booking_number   VARCHAR(255),
  provider_container_number VARCHAR(255),
  created_at                TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psl_shipment ON provider_shipment_links (shipment_id);
CREATE INDEX IF NOT EXISTS idx_psl_provider ON provider_shipment_links (provider_id);

CREATE TABLE IF NOT EXISTS provider_metadata (
  id            BIGSERIAL PRIMARY KEY,
  shipment_id   BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  provider_id   BIGINT NOT NULL REFERENCES tracking_providers(id) ON DELETE CASCADE,
  metadata_key  VARCHAR(255) NOT NULL,
  metadata_value JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_metadata_key ON provider_metadata (metadata_key);

-- =======================
-- Example queries (documentation only)
-- =======================
-- Latest status for a shipment
-- SELECT e.event_type, e.event_status, e.event_time
-- FROM events e WHERE e.shipment_id = $1 ORDER BY e.event_time DESC LIMIT 1;

-- Containers with their last event
-- SELECT c.container_number, ev.event_type, ev.event_time
-- FROM containers c
-- LEFT JOIN LATERAL (
--   SELECT * FROM events e
--   WHERE e.container_id = c.id
--   ORDER BY e.event_time DESC
--   LIMIT 1
-- ) ev ON TRUE
-- WHERE c.shipment_id = $1;

-- Provider metadata for a shipment
-- SELECT metadata_key, metadata_value FROM provider_metadata WHERE shipment_id = $1;

