-- ============================================================
-- RotoraxisMatch V2 — Supabase/Postgres Schema
-- ============================================================
-- Do not run in production. This is a design draft.
-- No destructive SQL included.
-- ============================================================


-- ============================================================
-- ENUMS
-- ============================================================
-- Using Postgres enums for all status fields.
-- Rationale: status values are fixed by business logic and change
-- only with deliberate migrations. Enums provide type safety and
-- clear documentation of allowed values.
-- Catalog values (technician types, license codes, etc.) are in
-- catalog tables instead so they can be extended without migrations.
-- ============================================================

CREATE TYPE app_role AS ENUM (
  'technician',
  'company_user',
  'admin'
);

CREATE TYPE user_status AS ENUM (
  'pending_verification',
  'active',
  'blocked',
  'suspended'
);

CREATE TYPE verification_status AS ENUM (
  'pending',
  'verified',
  'rejected'
);

CREATE TYPE document_status AS ENUM (
  'pending',
  'verified',
  'rejected',
  'expired'
);

CREATE TYPE offer_request_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'expired',    -- set server-side when offer expires without a response
  'withdrawn'   -- voluntary cancellation by the initiating party
);

CREATE TYPE offer_status AS ENUM (
  'draft',
  'published',
  'closed',
  'expired'
);

CREATE TYPE company_member_role AS ENUM (
  'admin',
  'recruiter',
  'viewer'
);

CREATE TYPE experience_unit AS ENUM (
  'hours',
  'years'
);

CREATE TYPE sender_role AS ENUM (
  'technician',
  'company'
);


-- ============================================================
-- CATALOG TABLES
-- ============================================================
-- Reference data managed by admin. Using text codes as PKs
-- so foreign key values are self-documenting in queries.
-- ============================================================

CREATE TABLE technician_types (
  code            TEXT    PRIMARY KEY,
  label           TEXT    NOT NULL,
  requires_license BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT     NOT NULL DEFAULT 0
);

CREATE TABLE license_categories (
  code            TEXT    PRIMARY KEY,
  label           TEXT    NOT NULL,
  category_group  TEXT    NOT NULL, -- 'A', 'B1', 'B2', 'B3', 'L', 'C'
  sort_order      INT     NOT NULL DEFAULT 0
);

CREATE TABLE aircraft_types (
  code            TEXT    PRIMARY KEY,
  label           TEXT    NOT NULL,
  manufacturer    TEXT,
  aircraft_family TEXT,   -- narrow_body | wide_body | helicopter | turboprop | piston
  is_active       BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE company_types (
  code            TEXT    PRIMARY KEY,
  label           TEXT    NOT NULL,
  sort_order      INT     NOT NULL DEFAULT 0
);

CREATE TABLE contract_types (
  code            TEXT    PRIMARY KEY,
  label           TEXT    NOT NULL,
  sort_order      INT     NOT NULL DEFAULT 0
);


-- ============================================================
-- CATALOG SEEDS
-- ============================================================

INSERT INTO technician_types (code, label, requires_license, is_active, sort_order) VALUES
  ('mechanic',           'Mechanic (Part-66 A / B1)',        true,  true,  1),
  ('avionic',            'Avionics Technician (Part-66 B2)', true,  true,  2),
  ('sheet_metal_worker', 'Sheet Metal Worker',                false, true,  3),
  ('painter',            'Aircraft Painter',                  false, true,  4),
  ('composite',          'Composite Technician',              false, true,  5),
  -- Pilot: exists in model, inactive in V2 UI
  ('pilot',              'Pilot',                             true,  false, 6);

INSERT INTO license_categories (code, label, category_group, sort_order) VALUES
  ('A1',   'A1 — Line Maintenance (Aeroplanes Turbine)',    'A',  1),
  ('A2',   'A2 — Line Maintenance (Aeroplanes Piston)',     'A',  2),
  ('A3',   'A3 — Line Maintenance (Helicopters Turbine)',   'A',  3),
  ('A4',   'A4 — Line Maintenance (Helicopters Piston)',    'A',  4),
  ('B1.1', 'B1.1 — Turbine-powered Aeroplanes',             'B1', 5),
  ('B1.2', 'B1.2 — Piston-powered Aeroplanes',              'B1', 6),
  ('B1.3', 'B1.3 — Turbine-powered Helicopters',            'B1', 7),
  ('B1.4', 'B1.4 — Piston-powered Helicopters',             'B1', 8),
  ('B2',   'B2 — Avionics',                                 'B2', 9),
  ('B2L',  'B2L — Limited Avionics',                        'B2', 10),
  ('B3',   'B3 — Light Aircraft Piston',                    'B3', 11),
  ('L',    'L — Light Aircraft',                            'L',  12),
  ('C',    'C — Base Maintenance',                          'C',  13);

INSERT INTO aircraft_types (code, label, manufacturer, aircraft_family, is_active) VALUES
  -- Airbus narrow-body
  ('A318',  'Airbus A318',           'Airbus',    'narrow_body', true),
  ('A319',  'Airbus A319',           'Airbus',    'narrow_body', true),
  ('A320',  'Airbus A320',           'Airbus',    'narrow_body', true),
  ('A321',  'Airbus A321',           'Airbus',    'narrow_body', true),
  -- Airbus wide-body
  ('A330',  'Airbus A330',           'Airbus',    'wide_body',   true),
  ('A340',  'Airbus A340',           'Airbus',    'wide_body',   true),
  ('A350',  'Airbus A350 XWB',       'Airbus',    'wide_body',   true),
  ('A380',  'Airbus A380',           'Airbus',    'wide_body',   true),
  -- Boeing narrow-body
  ('B737CL','Boeing 737 Classic',    'Boeing',    'narrow_body', true),
  ('B737NG','Boeing 737 NG',         'Boeing',    'narrow_body', true),
  ('B737M', 'Boeing 737 MAX',        'Boeing',    'narrow_body', true),
  -- Boeing wide-body
  ('B747',  'Boeing 747',            'Boeing',    'wide_body',   true),
  ('B757',  'Boeing 757',            'Boeing',    'narrow_body', true),
  ('B767',  'Boeing 767',            'Boeing',    'wide_body',   true),
  ('B777',  'Boeing 777',            'Boeing',    'wide_body',   true),
  ('B787',  'Boeing 787 Dreamliner', 'Boeing',    'wide_body',   true),
  -- Turboprops
  ('ATR42', 'ATR 42',                'ATR',       'turboprop',   true),
  ('ATR72', 'ATR 72',                'ATR',       'turboprop',   true),
  ('DH8D',  'Bombardier Q400',       'Bombardier','turboprop',   true),
  -- Airbus helicopters
  ('EC135', 'Airbus H135 (EC135)',   'Airbus',    'helicopter',  true),
  ('EC145', 'Airbus H145 (EC145)',   'Airbus',    'helicopter',  true),
  ('EC175', 'Airbus H175',           'Airbus',    'helicopter',  true),
  ('AS350', 'Airbus H125 (AS350)',   'Airbus',    'helicopter',  true),
  ('AS365', 'Airbus H155 (AS365)',   'Airbus',    'helicopter',  true),
  ('EC225', 'Airbus H225 (EC225)',   'Airbus',    'helicopter',  true),
  -- Sikorsky
  ('S61',   'Sikorsky S-61',         'Sikorsky',  'helicopter',  true),
  ('S76',   'Sikorsky S-76',         'Sikorsky',  'helicopter',  true),
  ('S92',   'Sikorsky S-92',         'Sikorsky',  'helicopter',  true),
  -- Bell
  ('B206',  'Bell 206 JetRanger',    'Bell',      'helicopter',  true),
  ('B412',  'Bell 412',              'Bell',      'helicopter',  true),
  ('B429',  'Bell 429',              'Bell',      'helicopter',  true),
  -- Light piston
  ('C172',  'Cessna 172',            'Cessna',    'piston',      true),
  ('C182',  'Cessna 182',            'Cessna',    'piston',      true),
  ('PA28',  'Piper PA-28',           'Piper',     'piston',      true);

INSERT INTO company_types (code, label, sort_order) VALUES
  ('MRO',                 'MRO (Maintenance, Repair & Overhaul)', 1),
  ('airline',             'Airline',                               2),
  ('recruitment_agency',  'Recruitment Agency',                    3),
  ('helicopter_operator', 'Helicopter Operator',                   4),
  ('other',               'Other',                                 5);

INSERT INTO contract_types (code, label, sort_order) VALUES
  ('permanent',  'Permanent',  1),
  ('long_term',  'Long Term',  2),
  ('short_term', 'Short Term', 3);


-- ============================================================
-- BASE TABLES
-- ============================================================

-- profiles
-- Bridge between auth.users and app-level roles.
-- One row per authenticated user. id = auth.users.id.
CREATE TABLE profiles (
  id         UUID         PRIMARY KEY, -- = auth.users.id
  role       app_role     NOT NULL,
  status     user_status  NOT NULL DEFAULT 'pending_verification',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- ============================================================
-- TECHNICIAN TABLES
-- ============================================================

-- IMPORTANT: Companies must NEVER query technician_profiles directly.
-- All company-facing technician queries must go through technician_public_view (defined in RLS_PLAN_V2.md).
-- The view enforces column-level privacy via CASE WHEN offer_accepted_between().
CREATE TABLE technician_profiles (
  id                   UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID                NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  anonymous_code       TEXT                NOT NULL UNIQUE,

  -- Private fields (hidden until offer accepted)
  first_name           TEXT                NOT NULL,
  last_name            TEXT                NOT NULL,
  email                TEXT                NOT NULL,
  phone                TEXT,
  birth_date           DATE                NOT NULL,

  -- Public professional fields
  technician_type      TEXT                NOT NULL REFERENCES technician_types(code),
  country              TEXT                NOT NULL,
  city                 TEXT                NOT NULL,
  base_airport         TEXT,
  latitude             DOUBLE PRECISION,
  longitude            DOUBLE PRECISION,

  -- Availability as JSONB: { immediately, available_from, contract_types[] }
  availability         JSONB               NOT NULL DEFAULT '{"immediately": false, "available_from": null, "contract_types": []}',

  -- Status
  verification_status  verification_status NOT NULL DEFAULT 'pending',
  profile_completeness INT                 NOT NULL DEFAULT 0 CHECK (profile_completeness BETWEEN 0 AND 100),

  -- Optional private fields
  social_links         JSONB,

  created_at           TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE TABLE technician_licenses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id  UUID        NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  license_code   TEXT        NOT NULL REFERENCES license_categories(code),
  issued_at      DATE,
  expires_at     DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (technician_id, license_code)
);

CREATE TABLE technician_habilitations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id       UUID        NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  license_code        TEXT        NOT NULL REFERENCES license_categories(code),
  aircraft_type_code  TEXT        NOT NULL REFERENCES aircraft_types(code),
  issued_at           DATE,
  expires_at          DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (technician_id, license_code, aircraft_type_code)
);

CREATE TABLE technician_aircraft_experience (
  id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id       UUID             NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  aircraft_type_code  TEXT             NOT NULL REFERENCES aircraft_types(code),
  value               DOUBLE PRECISION NOT NULL CHECK (value >= 0),
  unit                experience_unit  NOT NULL,
  created_at          TIMESTAMPTZ      NOT NULL DEFAULT now(),
  UNIQUE (technician_id, aircraft_type_code)
);

CREATE TABLE documents (
  id             UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id  UUID             NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  type           TEXT             NOT NULL,  -- 'license' | 'medical' | 'id' | 'training' | 'resume' | 'other'
  file_name      TEXT             NOT NULL,
  storage_path   TEXT             NOT NULL,  -- local path in demo; Supabase Storage path later
  status         document_status  NOT NULL DEFAULT 'pending',
  uploaded_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
  verified_at    TIMESTAMPTZ,
  verified_by    UUID             REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at     TIMESTAMPTZ
);


-- ============================================================
-- COMPANY TABLES
-- ============================================================

CREATE TABLE companies (
  id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT                NOT NULL,
  country             TEXT                NOT NULL,
  city                TEXT                NOT NULL,
  phone               TEXT,
  email               TEXT                NOT NULL,
  company_type        TEXT                NOT NULL REFERENCES company_types(code),
  verification_status verification_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE TABLE company_members (
  id          UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID                NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID                NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        company_member_role NOT NULL DEFAULT 'viewer',
  created_at  TIMESTAMPTZ         NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);


-- ============================================================
-- OFFERS
-- ============================================================

CREATE TABLE offers (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                 TEXT          NOT NULL,
  description           TEXT          NOT NULL,
  contract_type         TEXT          NOT NULL REFERENCES contract_types(code),
  location_country      TEXT          NOT NULL,
  location_city         TEXT          NOT NULL,
  location_base_airport TEXT,
  min_years_experience  INT           NOT NULL DEFAULT 0 CHECK (min_years_experience >= 0),
  status                offer_status  NOT NULL DEFAULT 'draft',
  visible               BOOLEAN       NOT NULL DEFAULT false,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Required technician types for an offer (optional — no rows = any type accepted)
CREATE TABLE offer_required_technician_types (
  offer_id        UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  technician_type TEXT NOT NULL REFERENCES technician_types(code),
  PRIMARY KEY (offer_id, technician_type)
);

-- Required licenses for an offer (optional)
CREATE TABLE offer_required_licenses (
  offer_id     UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  license_code TEXT NOT NULL REFERENCES license_categories(code),
  PRIMARY KEY (offer_id, license_code)
);

-- Required aircraft types for an offer (optional)
CREATE TABLE offer_required_aircraft_types (
  offer_id            UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  aircraft_type_code  TEXT NOT NULL REFERENCES aircraft_types(code),
  PRIMARY KEY (offer_id, aircraft_type_code)
);


-- ============================================================
-- OFFER REQUESTS
-- Company sends a direct offer to a specific technician.
-- ============================================================

CREATE TABLE offer_requests (
  id                  UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID                 NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  technician_id       UUID                 NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  offer_id            UUID                 REFERENCES offers(id) ON DELETE SET NULL,
  status              offer_request_status NOT NULL DEFAULT 'pending',
  -- READ-ONLY: set exclusively by handle_offer_accepted trigger, never by client
  identity_revealed   BOOLEAN              NOT NULL DEFAULT false,
  -- READ-ONLY: set exclusively by handle_offer_accepted trigger, never by client
  documents_unlocked  BOOLEAN              NOT NULL DEFAULT false,
  message             TEXT,
  created_at          TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ          NOT NULL DEFAULT now()
);


-- ============================================================
-- OFFER APPLICATIONS
-- Technician applies to a published offer.
-- ============================================================

CREATE TABLE offer_applications (
  id                  UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id       UUID                 NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  offer_id            UUID                 NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  company_id          UUID                 NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status              offer_request_status NOT NULL DEFAULT 'pending',
  -- READ-ONLY: set exclusively by handle_offer_accepted trigger, never by client
  identity_revealed   BOOLEAN              NOT NULL DEFAULT false,
  -- READ-ONLY: set exclusively by handle_offer_accepted trigger, never by client
  documents_unlocked  BOOLEAN              NOT NULL DEFAULT false,
  cover_note          TEXT,
  created_at          TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ          NOT NULL DEFAULT now(),
  -- One application per technician per offer
  UNIQUE (technician_id, offer_id)
);


-- ============================================================
-- CHAT
-- Chat rooms are created only on acceptance.
-- ============================================================

CREATE TABLE chat_rooms (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_request_id      UUID        REFERENCES offer_requests(id) ON DELETE CASCADE,
  offer_application_id  UUID        REFERENCES offer_applications(id) ON DELETE CASCADE,
  technician_id         UUID        NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  company_id            UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one source must be set
  CONSTRAINT check_single_source CHECK (
    (offer_request_id IS NOT NULL AND offer_application_id IS NULL) OR
    (offer_request_id IS NULL AND offer_application_id IS NOT NULL)
  )
);

-- Enforce one chat room per offer_request (NULLs excluded)
CREATE UNIQUE INDEX idx_chat_rooms_offer_request
  ON chat_rooms(offer_request_id)
  WHERE offer_request_id IS NOT NULL;

-- Enforce one chat room per offer_application (NULLs excluded)
CREATE UNIQUE INDEX idx_chat_rooms_offer_application
  ON chat_rooms(offer_application_id)
  WHERE offer_application_id IS NOT NULL;

CREATE TABLE chat_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id  UUID        NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_role   sender_role NOT NULL,
  body          TEXT        NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- INDEXES
-- ============================================================

-- Technician search
CREATE INDEX idx_technician_profiles_user_id         ON technician_profiles(user_id);
CREATE INDEX idx_technician_profiles_type            ON technician_profiles(technician_type);
CREATE INDEX idx_technician_profiles_verification    ON technician_profiles(verification_status);
CREATE INDEX idx_technician_profiles_country_city    ON technician_profiles(country, city);

-- Licenses / habilitations / experience
CREATE INDEX idx_technician_licenses_technician      ON technician_licenses(technician_id);
CREATE INDEX idx_technician_licenses_code            ON technician_licenses(license_code);
CREATE INDEX idx_technician_habilitations_technician ON technician_habilitations(technician_id);
CREATE INDEX idx_aircraft_experience_technician      ON technician_aircraft_experience(technician_id);

-- Documents
CREATE INDEX idx_documents_technician                ON documents(technician_id);
CREATE INDEX idx_documents_status                    ON documents(status);

-- Companies
CREATE INDEX idx_company_members_company             ON company_members(company_id);
CREATE INDEX idx_company_members_user                ON company_members(user_id);

-- Offers
CREATE INDEX idx_offers_company                      ON offers(company_id);
CREATE INDEX idx_offers_status_visible               ON offers(status, visible);
CREATE INDEX idx_offers_contract_type                ON offers(contract_type);

-- Offer requests
CREATE INDEX idx_offer_requests_company              ON offer_requests(company_id);
CREATE INDEX idx_offer_requests_technician           ON offer_requests(technician_id);
CREATE INDEX idx_offer_requests_status               ON offer_requests(status);

-- Offer applications
CREATE INDEX idx_offer_applications_technician       ON offer_applications(technician_id);
CREATE INDEX idx_offer_applications_offer            ON offer_applications(offer_id);
CREATE INDEX idx_offer_applications_company          ON offer_applications(company_id);
CREATE INDEX idx_offer_applications_status           ON offer_applications(status);

-- Chat
CREATE INDEX idx_chat_rooms_technician               ON chat_rooms(technician_id);
CREATE INDEX idx_chat_rooms_company                  ON chat_rooms(company_id);
CREATE INDEX idx_chat_messages_room_sent             ON chat_messages(chat_room_id, sent_at);


-- ============================================================
-- HELPER FUNCTION: compute age from birth_date
-- Used in RLS views to expose age without exposing birth_date.
-- ============================================================

CREATE OR REPLACE FUNCTION compute_age(birth_date DATE)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT DATE_PART('year', AGE(CURRENT_DATE, birth_date))::INT
$$;


-- ============================================================
-- NOTES
-- ============================================================
-- 1. Triggers for on_offer_accepted (set identity_revealed,
--    documents_unlocked, create chat_room) are planned but not
--    included here. They belong in a migrations file once
--    Supabase is connected.
--
-- 2. RLS policies are designed in docs/RLS_PLAN_V2.md and will
--    be added separately per table during Phase V2-9.
--
-- 3. Storage bucket 'technician-documents' is provisioned
--    separately in Supabase. Path: {technician_id}/{document_id}/{file_name}
-- ============================================================
