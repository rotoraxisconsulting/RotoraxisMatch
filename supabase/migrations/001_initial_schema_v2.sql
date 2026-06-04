-- ============================================================
-- RotoraxisMatch V2 — Migration 001: Initial Schema + RLS
-- ============================================================
-- Target:  rotoaxismatch-dev (rwauwuremzkizeoginza)
-- Pg:      17.6.1  |  Region: eu-west-1
-- Created: 2026-06-03
--
-- Sections:
--   1.  ENUMs
--   2.  Catalog tables + seeds
--   3.  location_airports table + full seed (~250 airports)
--   4.  profiles + auth new-user trigger
--   5.  updated_at helper function
--   6.  Technician tables
--   7.  Company tables
--   8.  Offers + offer_required_* tables
--   9.  offer_requests + offer_applications
--  10.  chat_rooms + chat_messages
--  11.  activity_events + activity_reads
--  12.  Indexes
--  13.  Auth helper functions + compute_age
--  14.  technician_public_view
--  15.  Row Level Security — ENABLE + all policies
--  16.  Offer acceptance trigger
--  17.  updated_at triggers
--
-- NOT included (handle separately):
--   - Local demo seeds (demo IDs are not valid Supabase UUIDs)
--   - Admin bootstrap  → docs/V2_S1_ADMIN_BOOTSTRAP_SQL.sql
--   - Storage bucket "technician-documents" → Supabase Dashboard / CLI
--   - Storage object policies → add after bucket creation
-- ============================================================


-- ============================================================
-- 1. ENUMS
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
  'expired',
  'withdrawn'
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

CREATE TYPE activity_type AS ENUM (
  'application_received',
  'application_accepted',
  'application_rejected',
  'direct_offer_received',
  'direct_offer_accepted',
  'direct_offer_rejected',
  'chat_message_received'
);

CREATE TYPE activity_recipient_scope AS ENUM (
  'technician',
  'company'
);

CREATE TYPE activity_entity_type AS ENUM (
  'offer_request',
  'offer_application',
  'chat_message'
);


-- ============================================================
-- 2. CATALOG TABLES + SEEDS
-- ============================================================

CREATE TABLE technician_types (
  code             TEXT    PRIMARY KEY,
  label            TEXT    NOT NULL,
  requires_license BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  sort_order       INT     NOT NULL DEFAULT 0
);

CREATE TABLE license_categories (
  code           TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  category_group TEXT NOT NULL,
  sort_order     INT  NOT NULL DEFAULT 0
);

CREATE TABLE aircraft_types (
  code              TEXT    PRIMARY KEY,
  label             TEXT    NOT NULL,
  manufacturer      TEXT,
  aircraft_family   TEXT,
  aircraft_category TEXT    NOT NULL CHECK (aircraft_category IN ('airplane', 'helicopter')),
  is_active         BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE company_types (
  code       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0
);

CREATE TABLE contract_types (
  code       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0
);

INSERT INTO technician_types (code, label, requires_license, is_active, sort_order) VALUES
  ('mechanic',           'Mechanic (Part-66 A / B1)',        true,  true,  1),
  ('avionic',            'Avionics Technician (Part-66 B2)', true,  true,  2),
  ('sheet_metal_worker', 'Sheet Metal Worker',               false, true,  3),
  ('painter',            'Aircraft Painter',                 false, true,  4),
  ('composite',          'Composite Technician',             false, true,  5),
  ('pilot',              'Pilot',                            true,  false, 6);

INSERT INTO license_categories (code, label, category_group, sort_order) VALUES
  ('A1',   'A1 — Line Maintenance (Aeroplanes Turbine)',    'A',  1),
  ('A2',   'A2 — Line Maintenance (Aeroplanes Piston)',     'A',  2),
  ('A3',   'A3 — Line Maintenance (Helicopters Turbine)',   'A',  3),
  ('A4',   'A4 — Line Maintenance (Helicopters Piston)',    'A',  4),
  ('B1.1', 'B1.1 — Turbine-powered Aeroplanes',            'B1', 5),
  ('B1.2', 'B1.2 — Piston-powered Aeroplanes',             'B1', 6),
  ('B1.3', 'B1.3 — Turbine-powered Helicopters',           'B1', 7),
  ('B1.4', 'B1.4 — Piston-powered Helicopters',            'B1', 8),
  ('B2',   'B2 — Avionics',                                'B2', 9),
  ('B2L',  'B2L — Limited Avionics',                       'B2', 10),
  ('B3',   'B3 — Light Aircraft Piston',                   'B3', 11),
  ('L',    'L — Light Aircraft',                           'L',  12),
  ('C',    'C — Base Maintenance',                         'C',  13);

INSERT INTO aircraft_types (code, label, manufacturer, aircraft_family, aircraft_category, is_active) VALUES
  ('A220',  'Airbus A220',           'Airbus',             'narrow_body', 'airplane',   true),
  ('A318',  'Airbus A318',           'Airbus',             'narrow_body', 'airplane',   true),
  ('A319',  'Airbus A319',           'Airbus',             'narrow_body', 'airplane',   true),
  ('A320',  'Airbus A320',           'Airbus',             'narrow_body', 'airplane',   true),
  ('A321',  'Airbus A321',           'Airbus',             'narrow_body', 'airplane',   true),
  ('A330',  'Airbus A330',           'Airbus',             'wide_body',   'airplane',   true),
  ('A340',  'Airbus A340',           'Airbus',             'wide_body',   'airplane',   true),
  ('A350',  'Airbus A350 XWB',       'Airbus',             'wide_body',   'airplane',   true),
  ('A380',  'Airbus A380',           'Airbus',             'wide_body',   'airplane',   true),
  ('B737',  'Boeing 737',            'Boeing',             'narrow_body', 'airplane',   true),
  ('B757',  'Boeing 757',            'Boeing',             'narrow_body', 'airplane',   true),
  ('B747',  'Boeing 747',            'Boeing',             'wide_body',   'airplane',   true),
  ('B767',  'Boeing 767',            'Boeing',             'wide_body',   'airplane',   true),
  ('B777',  'Boeing 777',            'Boeing',             'wide_body',   'airplane',   true),
  ('B787',  'Boeing 787 Dreamliner', 'Boeing',             'wide_body',   'airplane',   true),
  ('ATR42', 'ATR 42',                'ATR',                'turboprop',   'airplane',   true),
  ('ATR72', 'ATR 72',                'ATR',                'turboprop',   'airplane',   true),
  ('Q400',  'Bombardier Q400',       'Bombardier',         'turboprop',   'airplane',   true),
  ('CRJ200','Bombardier CRJ-200',    'Bombardier',         'narrow_body', 'airplane',   true),
  ('CRJ700','Bombardier CRJ-700',    'Bombardier',         'narrow_body', 'airplane',   true),
  ('CRJ900','Bombardier CRJ-900',    'Bombardier',         'narrow_body', 'airplane',   true),
  ('E175',  'Embraer E175',          'Embraer',            'narrow_body', 'airplane',   true),
  ('E190',  'Embraer E190',          'Embraer',            'narrow_body', 'airplane',   true),
  ('E195',  'Embraer E195',          'Embraer',            'narrow_body', 'airplane',   true),
  ('H125',  'Airbus H125',           'Airbus Helicopters', 'helicopter',  'helicopter', true),
  ('H135',  'Airbus H135',           'Airbus Helicopters', 'helicopter',  'helicopter', true),
  ('H145',  'Airbus H145',           'Airbus Helicopters', 'helicopter',  'helicopter', true),
  ('S76',   'Sikorsky S-76',         'Sikorsky',           'helicopter',  'helicopter', true),
  ('S92',   'Sikorsky S-92',         'Sikorsky',           'helicopter',  'helicopter', true),
  ('B407',  'Bell 407',              'Bell',               'helicopter',  'helicopter', true),
  ('B412',  'Bell 412',              'Bell',               'helicopter',  'helicopter', true),
  ('AW139', 'Leonardo AW139',        'Leonardo',           'helicopter',  'helicopter', true),
  ('R44',   'Robinson R44',          'Robinson',           'helicopter',  'helicopter', true);

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
-- 3. LOCATION AIRPORTS TABLE + SEED
-- Source: src/constants/locationCities.ts (~250 airports)
-- ============================================================

CREATE TABLE location_airports (
  id           TEXT             PRIMARY KEY,
  country_name TEXT             NOT NULL,
  city         TEXT             NOT NULL,
  airport      TEXT             NOT NULL,
  icao         TEXT             NOT NULL UNIQUE,
  iata         TEXT,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  is_active    BOOLEAN          NOT NULL DEFAULT true
);

INSERT INTO location_airports (id, country_name, city, airport, icao, iata, latitude, longitude) VALUES
  -- Algeria
  ('airport:DAAG','Algeria','Algiers',    'Houari Boumediene Airport',             'DAAG','ALG', 36.693886,  3.214531),
  ('airport:DAOO','Algeria','Oran',       'Ahmed Ben Bella Airport',               'DAOO','ORN', 35.620648, -0.622486),
  ('airport:DABC','Algeria','Constantine','Mohamed Boudiaf International Airport', 'DABC','CZL', 36.276001,  6.620390),
  -- Argentina
  ('airport:SAEZ','Argentina','Buenos Aires','Ministro Pistarini International Airport',       'SAEZ','EZE',-34.822200,-58.535800),
  ('airport:SACO','Argentina','Córdoba',     'Ambrosio Taravella International Airport',       'SACO','COR',-31.312346,-64.208329),
  ('airport:SAME','Argentina','Mendoza',     'Governor Francisco Gabrielli International Airport','SAME','MDZ',-32.831699,-68.792900),
  ('airport:SAAR','Argentina','Rosario',     'Islas Malvinas International Airport',           'SAAR','ROS',-32.903600,-60.785000),
  -- Australia
  ('airport:YSSY','Australia','Sydney',   'Sydney Kingsford Smith Airport','YSSY','SYD',-33.946098, 151.177002),
  ('airport:YMML','Australia','Melbourne','Melbourne Airport',             'YMML','MEL',-37.670732, 144.837898),
  ('airport:YBBN','Australia','Brisbane', 'Brisbane Airport',              'YBBN','BNE',-27.384199, 153.117004),
  ('airport:YPPH','Australia','Perth',    'Perth Airport',                 'YPPH','PER',-31.940300, 115.967003),
  ('airport:YPAD','Australia','Adelaide', 'Adelaide Airport',              'YPAD','ADL',-34.947512, 138.533393),
  -- Austria
  ('airport:LOWW','Austria','Vienna',   'Vienna International Airport',   'LOWW','VIE', 48.110298, 16.569700),
  ('airport:LOWS','Austria','Salzburg', 'Salzburg Airport W. A. Mozart', 'LOWS','SZG', 47.793301, 13.004300),
  ('airport:LOWI','Austria','Innsbruck','Innsbruck Airport',               'LOWI','INN', 47.260201, 11.344000),
  -- Bahrain
  ('airport:OBBI','Bahrain','Manama','Bahrain International Airport','OBBI','BAH', 26.267295, 50.637640),
  -- Belgium
  ('airport:EBBR','Belgium','Brussels', 'Brussels Airport',               'EBBR','BRU', 50.901402,  4.484440),
  ('airport:EBLG','Belgium','Liège',    'Liège Airport',                  'EBLG','LGG', 50.638574,  5.443897),
  ('airport:EBCI','Belgium','Charleroi','Brussels South Charleroi Airport','EBCI','CRL', 50.461963,  4.459562),
  -- Brazil
  ('airport:SBGR','Brazil','São Paulo',      'Guarulhos International Airport',                               'SBGR','GRU',-23.431274,-46.469954),
  ('airport:SBGL','Brazil','Rio de Janeiro', 'Galeão International Airport',                                  'SBGL','GIG',-22.809999,-43.250557),
  ('airport:SBBR','Brazil','Brasília',       'Presidente Juscelino Kubitschek International Airport',         'SBBR','BSB',-15.869167,-47.920834),
  ('airport:SBCF','Brazil','Belo Horizonte', 'Tancredo Neves International Airport',                          'SBCF','CNF',-19.635710,-43.966928),
  ('airport:SBEG','Brazil','Manaus',         'Eduardo Gomes International Airport',                           'SBEG','MAO', -3.038610,-60.049702),
  -- Canada
  ('airport:CYYZ','Canada','Toronto',  'Toronto Pearson International Airport',          'CYYZ','YYZ', 43.675935, -79.629421),
  ('airport:CYVR','Canada','Vancouver','Vancouver International Airport',                 'CYVR','YVR', 49.193901,-123.183998),
  ('airport:CYUL','Canada','Montréal', 'Montréal–Trudeau International Airport',          'CYUL','YUL', 45.467837, -73.742294),
  ('airport:CYYC','Canada','Calgary',  'Calgary International Airport',                  'CYYC','YYC', 51.118822,-114.009933),
  ('airport:CYOW','Canada','Ottawa',   'Ottawa Macdonald–Cartier International Airport',  'CYOW','YOW', 45.322498, -75.669197),
  ('airport:CYEG','Canada','Edmonton', 'Edmonton International Airport',                  'CYEG','YEG', 53.309700,-113.580002),
  -- Chile
  ('airport:SCEL','Chile','Santiago',    'Arturo Merino Benítez International Airport','SCEL','SCL',-33.393002,-70.785797),
  ('airport:SCIE','Chile','Concepción',  'Carriel Sur International Airport',          'SCIE','CCP',-36.772350,-73.062828),
  ('airport:SCTE','Chile','Puerto Montt','El Tepual Airport',                           'SCTE','PMC',-41.443093,-73.094065),
  -- China
  ('airport:ZBAA','China','Beijing',   'Beijing Capital International Airport',   'ZBAA','PEK', 40.077349, 116.596702),
  ('airport:ZSPD','China','Shanghai',  'Shanghai Pudong International Airport',   'ZSPD','PVG', 31.143400, 121.805000),
  ('airport:ZGGG','China','Guangzhou', 'Guangzhou Baiyun International Airport',  'ZGGG','CAN', 23.392401, 113.299004),
  ('airport:ZGSZ','China','Shenzhen',  'Shenzhen Bao''an International Airport', 'ZGSZ','SZX', 22.639474, 113.803262),
  ('airport:ZUTF','China','Chengdu',   'Chengdu Tianfu International Airport',    'ZUTF','TFU', 30.312520, 104.441284),
  ('airport:ZUCK','China','Chongqing', 'Chongqing Jiangbei International Airport','ZUCK','CKG', 29.712254, 106.651895),
  -- Colombia
  ('airport:SKBO','Colombia','Bogotá',   'El Dorado International Airport',             'SKBO','BOG',  4.701590,-74.146900),
  ('airport:SKRG','Colombia','Medellín', 'José María Córdova International Airport',    'SKRG','MDE',  6.164540,-75.423100),
  ('airport:SKCL','Colombia','Cali',     'Alfonso Bonilla Aragón International Airport','SKCL','CLO',  3.542717,-76.381898),
  ('airport:SKCG','Colombia','Cartagena','Rafael Núñez International Airport',          'SKCG','CTG', 10.442400,-75.513000),
  -- Côte d'Ivoire
  ('airport:DIAP','Côte d''Ivoire','Abidjan',      'Félix-Houphouët-Boigny International Airport','DIAP','ABJ', 5.261390,-3.926290),
  ('airport:DIYO','Côte d''Ivoire','Yamoussoukro', 'Yamoussoukro Airport',                        'DIYO','ASK', 6.903170,-5.365580),
  -- Croatia
  ('airport:LDZA','Croatia','Zagreb',   'Franjo Tuđman Airport','LDZA','ZAG', 45.742901, 16.068800),
  ('airport:LDSP','Croatia','Split',    'Split Airport',          'LDSP','SPU', 43.538898, 16.298000),
  ('airport:LDDU','Croatia','Dubrovnik','Dubrovnik Airport',       'LDDU','DBV', 42.562247, 18.265543),
  -- Czech Republic
  ('airport:LKPR','Czech Republic','Prague', 'Václav Havel Airport Prague', 'LKPR','PRG', 50.100874, 14.259911),
  ('airport:LKTB','Czech Republic','Brno',   'Brno-Tuřany Airport',         'LKTB','BRQ', 49.151276, 16.693972),
  ('airport:LKMT','Czech Republic','Ostrava','Leoš Janáček Airport Ostrava','LKMT','OSR', 49.696301, 18.111099),
  -- Denmark
  ('airport:EKCH','Denmark','Copenhagen','Copenhagen Airport','EKCH','CPH', 55.617901, 12.656000),
  ('airport:EKBI','Denmark','Billund',   'Billund Airport',    'EKBI','BLL', 55.740335,  9.157019),
  ('airport:EKAH','Denmark','Aarhus',    'Aarhus Airport',     'EKAH','AAR', 56.303331, 10.618286),
  -- Ecuador
  ('airport:SEQM','Ecuador','Quito',     'Mariscal Sucre International Airport',         'SEQM','UIO', -0.125399,-78.354306),
  ('airport:SEGU','Ecuador','Guayaquil', 'José Joaquín de Olmedo International Airport', 'SEGU','GYE', -2.157420,-79.883598),
  -- Egypt
  ('airport:HECA','Egypt','Cairo',     'Cairo International Airport',    'HECA','CAI', 30.111534, 31.396694),
  ('airport:HELX','Egypt','Luxor',     'Luxor International Airport',    'HELX','LXR', 25.671018, 32.706446),
  ('airport:HEGN','Egypt','Hurghada',  'Hurghada International Airport', 'HEGN','HRG', 27.176776, 33.796692),
  ('airport:HEBA','Egypt','Alexandria','Borg El Arab Airport',           'HEBA','HBE', 30.932490, 29.696437),
  -- Ethiopia
  ('airport:HAAB','Ethiopia','Addis Ababa','Bole International Airport',               'HAAB','ADD',  8.977890, 38.799301),
  ('airport:HADR','Ethiopia','Dire Dawa', 'Aba Tenna D Yilma International Airport',  'HADR','DIR',  9.623549, 41.855027),
  -- Finland
  ('airport:EFHK','Finland','Helsinki','Helsinki–Vantaa Airport',  'EFHK','HEL', 60.318363, 24.963341),
  ('airport:EFTP','Finland','Tampere', 'Tampere–Pirkkala Airport', 'EFTP','TMP', 61.414101, 23.604401),
  ('airport:EFOU','Finland','Oulu',    'Oulu Airport',              'EFOU','OUL', 64.930099, 25.354601),
  ('airport:EFTU','Finland','Turku',   'Turku Airport',             'EFTU','TKU', 60.514099, 22.262800),
  -- France
  ('airport:LFPG','France','Paris',    'Charles de Gaulle Airport',  'LFPG','CDG', 49.008960,  2.554117),
  ('airport:LFPO','France','Paris',    'Orly Airport',               'LFPO','ORY', 48.729499,  2.358963),
  ('airport:LFMN','France','Nice',     'Nice Côte d''Azur Airport',  'LFMN','NCE', 43.658401,  7.215870),
  ('airport:LFLL','France','Lyon',     'Lyon–Saint-Exupéry Airport', 'LFLL','LYS', 45.725996,  5.090139),
  ('airport:LFML','France','Marseille','Marseille Provence Airport', 'LFML','MRS', 43.438088,  5.212500),
  ('airport:LFBO','France','Toulouse', 'Toulouse–Blagnac Airport',   'LFBO','TLS', 43.629101,  1.363820),
  ('airport:LFBD','France','Bordeaux', 'Bordeaux–Mérignac Airport',  'LFBD','BOD', 44.828650, -0.715356),
  -- Germany
  ('airport:EDDF','Germany','Frankfurt', 'Frankfurt Airport',          'EDDF','FRA', 50.026706,  8.558350),
  ('airport:EDDM','Germany','Munich',    'Munich Airport',             'EDDM','MUC', 48.353802, 11.786100),
  ('airport:EDDB','Germany','Berlin',    'Berlin Brandenburg Airport', 'EDDB','BER', 52.361738, 13.502341),
  ('airport:EDDL','Germany','Düsseldorf','Düsseldorf Airport',        'EDDL','DUS', 51.289501,  6.766780),
  ('airport:EDDH','Germany','Hamburg',   'Hamburg Airport',            'EDDH','HAM', 53.630402,  9.988230),
  ('airport:EDDK','Germany','Cologne',   'Cologne Bonn Airport',       'EDDK','CGN', 50.865898,  7.142740),
  ('airport:EDDS','Germany','Stuttgart', 'Stuttgart Airport',           'EDDS','STR', 48.689899,  9.221960),
  -- Ghana
  ('airport:DGAA','Ghana','Accra', 'Kotoka International Airport','DGAA','ACC',  5.605190,-0.166786),
  ('airport:DGSI','Ghana','Kumasi','Kumasi Airport',               'DGSI','KMS',  6.714560,-1.590820),
  -- Greece
  ('airport:LGAV','Greece','Athens',       'Athens International Airport Eleftherios Venizelos','LGAV','ATH', 37.936401, 23.944500),
  ('airport:LGTS','Greece','Thessaloniki', 'Thessaloniki Airport Macedonia',                    'LGTS','SKG', 40.519280, 22.970009),
  ('airport:LGIR','Greece','Heraklion',    'Heraklion International Airport Nikos Kazantzakis', 'LGIR','HER', 35.339699, 25.180300),
  ('airport:LGRP','Greece','Rhodes',       'Rhodes International Airport Diagoras',              'LGRP','RHO', 36.405399, 28.086201),
  -- Hong Kong
  ('airport:VHHH','Hong Kong','Hong Kong','Hong Kong International Airport','VHHH','HKG', 22.311840, 113.914862),
  -- Hungary
  ('airport:LHBP','Hungary','Budapest', 'Budapest Ferenc Liszt International Airport','LHBP','BUD', 47.430180, 19.262393),
  ('airport:LHDC','Hungary','Debrecen', 'Debrecen International Airport',             'LHDC','DEB', 47.489469, 21.616278),
  -- India
  ('airport:VIDP','India','Delhi',     'Indira Gandhi International Airport',              'VIDP','DEL', 28.555630,  77.095190),
  ('airport:VABB','India','Mumbai',    'Chhatrapati Shivaji Maharaj International Airport','VABB','BOM', 19.088699,  72.867897),
  ('airport:VOBL','India','Bangalore', 'Kempegowda International Airport',                 'VOBL','BLR', 13.197900,  77.706299),
  ('airport:VOMM','India','Chennai',   'Chennai International Airport',                    'VOMM','MAA', 12.990005,  80.169296),
  ('airport:VOHS','India','Hyderabad', 'Rajiv Gandhi International Airport',               'VOHS','HYD', 17.231318,  78.429855),
  ('airport:VECC','India','Kolkata',   'Netaji Subhas Chandra Bose International Airport', 'VECC','CCU', 22.654012,  88.447650),
  -- Indonesia
  ('airport:WIII','Indonesia','Jakarta',  'Soekarno–Hatta International Airport','WIII','CGK', -6.125570, 106.655998),
  ('airport:WADD','Indonesia','Bali',     'Ngurah Rai International Airport',     'WADD','DPS', -8.748409, 115.167123),
  ('airport:WARR','Indonesia','Surabaya', 'Juanda International Airport',         'WARR','SUB', -7.379830, 112.787003),
  ('airport:WIMM','Indonesia','Medan',    'Kualanamu International Airport',      'WIMM','KNO',  3.637847,  98.870566),
  -- Ireland
  ('airport:EIDW','Ireland','Dublin', 'Dublin Airport', 'EIDW','DUB', 53.428713, -6.262121),
  ('airport:EICK','Ireland','Cork',   'Cork Airport',   'EICK','ORK', 51.841301, -8.491110),
  ('airport:EINN','Ireland','Shannon','Shannon Airport', 'EINN','SNN', 52.702000, -8.924820),
  -- Israel
  ('airport:LLBG','Israel','Tel Aviv','Ben Gurion International Airport','LLBG','TLV', 32.011398, 34.886700),
  ('airport:LLET','Israel','Eilat',   'Ramon Airport',                  'LLET','ETM', 29.727009, 35.014116),
  ('airport:LLHA','Israel','Haifa',   'Haifa Airport',                  'LLHA','HFA', 32.810219, 35.043719),
  -- Italy
  ('airport:LIRF','Italy','Rome',    'Leonardo da Vinci–Fiumicino Airport','LIRF','FCO', 41.804532, 12.251998),
  ('airport:LIMC','Italy','Milan',   'Milan Malpensa Airport',             'LIMC','MXP', 45.630600,  8.728110),
  ('airport:LIML','Italy','Milan',   'Milan Linate Airport',               'LIML','LIN', 45.445099,  9.276740),
  ('airport:LIPZ','Italy','Venice',  'Venice Marco Polo Airport',          'LIPZ','VCE', 45.505299, 12.351900),
  ('airport:LIRN','Italy','Naples',  'Naples International Airport',       'LIRN','NAP', 40.886002, 14.290800),
  ('airport:LICC','Italy','Catania', 'Catania Fontanarossa Airport',       'LICC','CTA', 37.466801, 15.066400),
  ('airport:LIPE','Italy','Bologna', 'Bologna Guglielmo Marconi Airport',  'LIPE','BLQ', 44.535400, 11.288700),
  -- Japan
  ('airport:RJAA','Japan','Tokyo',   'Narita International Airport',         'RJAA','NRT', 35.768580, 140.388714),
  ('airport:RJTT','Japan','Tokyo',   'Tokyo Haneda Airport',                 'RJTT','HND', 35.549678, 139.786958),
  ('airport:RJBB','Japan','Osaka',   'Kansai International Airport',         'RJBB','KIX', 34.427299, 135.244003),
  ('airport:RJGG','Japan','Nagoya',  'Chubu Centrair International Airport', 'RJGG','NGO', 34.858398, 136.804993),
  ('airport:RJCC','Japan','Sapporo', 'New Chitose Airport',                  'RJCC','CTS', 42.774753, 141.690414),
  ('airport:RJFF','Japan','Fukuoka', 'Fukuoka Airport',                      'RJFF','FUK', 33.585899, 130.451004),
  -- Jordan
  ('airport:OJAI','Jordan','Amman','Queen Alia International Airport',   'OJAI','AMM', 31.722601, 35.993198),
  ('airport:OJAQ','Jordan','Aqaba', 'King Hussein International Airport', 'OJAQ','AQJ', 29.611601, 35.018101),
  -- Kenya
  ('airport:HKJK','Kenya','Nairobi', 'Jomo Kenyatta International Airport','HKJK','NBO', -1.318886, 36.928233),
  ('airport:HKMO','Kenya','Mombasa', 'Moi International Airport',          'HKMO','MBA', -4.034830, 39.594200),
  ('airport:HKKI','Kenya','Kisumu',  'Kisumu International Airport',        'HKKI','KIS', -0.086139, 34.728901),
  -- Kuwait
  ('airport:OKBK','Kuwait','Kuwait City','Kuwait International Airport','OKBK','KWI', 29.224487, 47.969813),
  -- Malaysia
  ('airport:WMKK','Malaysia','Kuala Lumpur',  'Kuala Lumpur International Airport', 'WMKK','KUL',  2.745580, 101.709999),
  ('airport:WMKP','Malaysia','Penang',        'Penang International Airport',       'WMKP','PEN',  5.296303, 100.276185),
  ('airport:WBKK','Malaysia','Kota Kinabalu', 'Kota Kinabalu International Airport','WBKK','BKI',  5.932743, 116.049324),
  ('airport:WMKJ','Malaysia','Johor Bahru',   'Senai International Airport',        'WMKJ','JHB',  1.641310, 103.669998),
  -- Mexico
  ('airport:MMMX','Mexico','Mexico City', 'Benito Juárez International Airport',                   'MMMX','MEX', 19.435822,  -99.070330),
  ('airport:MMUN','Mexico','Cancún',      'Cancún International Airport',                          'MMUN','CUN', 21.040817,  -86.873470),
  ('airport:MMGL','Mexico','Guadalajara', 'Miguel Hidalgo y Costilla International Airport',       'MMGL','GDL', 20.523342, -103.310108),
  ('airport:MMMY','Mexico','Monterrey',   'General Mariano Escobedo International Airport',        'MMMY','MTY', 25.778521, -100.106989),
  ('airport:MMTJ','Mexico','Tijuana',     'General Abelardo L. Rodríguez International Airport',  'MMTJ','TIJ', 32.541043, -116.969976),
  -- Morocco
  ('airport:GMMN','Morocco','Casablanca','Mohammed V International Airport','GMMN','CMN', 33.367500, -7.589970),
  ('airport:GMMX','Morocco','Marrakech', 'Menara Airport',                  'GMMX','RAK', 31.604807, -8.035788),
  ('airport:GMME','Morocco','Rabat',     'Rabat–Salé Airport',              'GMME','RBA', 34.051498, -6.751520),
  ('airport:GMFF','Morocco','Fez',       'Fès–Saïss Airport',               'GMFF','FEZ', 33.927299, -4.977960),
  -- Netherlands
  ('airport:EHAM','Netherlands','Amsterdam','Amsterdam Airport Schiphol', 'EHAM','AMS', 52.308601,  4.763890),
  ('airport:EHRD','Netherlands','Rotterdam','Rotterdam The Hague Airport','EHRD','RTM', 51.956902,  4.437220),
  ('airport:EHEH','Netherlands','Eindhoven','Eindhoven Airport',           'EHEH','EIN', 51.450100,  5.374530),
  -- New Zealand
  ('airport:NZAA','New Zealand','Auckland',     'Auckland Airport',                   'NZAA','AKL',-37.011990, 174.786331),
  ('airport:NZCH','New Zealand','Christchurch', 'Christchurch International Airport', 'NZCH','CHC',-43.489029, 172.532065),
  ('airport:NZWN','New Zealand','Wellington',   'Wellington International Airport',   'NZWN','WLG',-41.326839, 174.806862),
  ('airport:NZQN','New Zealand','Queenstown',   'Queenstown Airport',                 'NZQN','ZQN',-45.019205, 168.746379),
  -- Nigeria
  ('airport:DNMM','Nigeria','Lagos',         'Murtala Muhammed International Airport',  'DNMM','LOS',  6.577370,  3.321160),
  ('airport:DNAA','Nigeria','Abuja',         'Nnamdi Azikiwe International Airport',    'DNAA','ABV',  9.006790,  7.263170),
  ('airport:DNPO','Nigeria','Port Harcourt', 'Port Harcourt International Airport',     'DNPO','PHC',  5.015490,  6.949590),
  ('airport:DNKN','Nigeria','Kano',          'Mallam Aminu Kano International Airport', 'DNKN','KAN', 12.045613,  8.523566),
  -- Norway
  ('airport:ENGM','Norway','Oslo',     'Oslo Airport, Gardermoen',  'ENGM','OSL', 60.193901, 11.100400),
  ('airport:ENBR','Norway','Bergen',   'Bergen Airport, Flesland',  'ENBR','BGO', 60.293400,  5.218140),
  ('airport:ENZV','Norway','Stavanger','Stavanger Airport, Sola',   'ENZV','SVG', 58.876701,  5.637780),
  ('airport:ENVA','Norway','Trondheim','Trondheim Airport, Værnes', 'ENVA','TRD', 63.457802, 10.924000),
  -- Pakistan
  ('airport:OPKC','Pakistan','Karachi',   'Jinnah International Airport',       'OPKC','KHI', 24.906500, 67.160797),
  ('airport:OPLA','Pakistan','Lahore',    'Allama Iqbal International Airport',  'OPLA','LHE', 31.521601, 74.403603),
  ('airport:OPIS','Pakistan','Islamabad', 'Islamabad International Airport',     'OPIS','ISB', 33.549000, 72.825660),
  ('airport:OPPS','Pakistan','Peshawar',  'Bacha Khan International Airport',    'OPPS','PEW', 33.993900, 71.514603),
  -- Peru
  ('airport:SPJC','Peru','Lima',     'Jorge Chávez International Airport',             'SPJC','LIM',-12.021900,-77.114305),
  ('airport:SPZO','Peru','Cusco',    'Alejandro Velasco Astete International Airport', 'SPZO','CUZ',-13.535700,-71.938797),
  ('airport:SPQU','Peru','Arequipa', 'Rodríguez Ballón International Airport',         'SPQU','AQP',-16.340786,-71.569485),
  -- Philippines
  ('airport:RPLL','Philippines','Manila','Ninoy Aquino International Airport',    'RPLL','MNL', 14.508600, 121.019997),
  ('airport:RPVM','Philippines','Cebu',  'Mactan–Cebu International Airport',     'RPVM','CEB', 10.309261, 123.979740),
  ('airport:RPMD','Philippines','Davao', 'Francisco Bangoy International Airport','RPMD','DVO',  7.125520, 125.646004),
  ('airport:RPLC','Philippines','Clark', 'Clark International Airport',           'RPLC','CRK', 15.186000, 120.559998),
  -- Poland
  ('airport:EPWA','Poland','Warsaw',  'Warsaw Chopin Airport',                   'EPWA','WAW', 52.165699, 20.967100),
  ('airport:EPKK','Poland','Kraków',  'Kraków John Paul II International Airport','EPKK','KRK', 50.077702, 19.784800),
  ('airport:EPGD','Poland','Gdańsk',  'Lech Wałęsa Airport Gdańsk',             'EPGD','GDN', 54.377602, 18.466200),
  ('airport:EPWR','Poland','Wrocław', 'Copernicus Airport Wrocław',              'EPWR','WRO', 51.103719, 16.882096),
  ('airport:EPKT','Poland','Katowice','Katowice International Airport',           'EPKT','KTW', 50.476015, 19.080705),
  -- Portugal
  ('airport:LPPT','Portugal','Lisbon','Humberto Delgado Airport',      'LPPT','LIS', 38.781300, -9.135920),
  ('airport:LPPR','Portugal','Porto', 'Francisco Sá Carneiro Airport', 'LPPR','OPO', 41.248100, -8.681390),
  ('airport:LPFR','Portugal','Faro',  'Faro Airport',                  'LPFR','FAO', 37.015909, -7.970939),
  -- Qatar
  ('airport:OTHH','Qatar','Doha','Hamad International Airport','OTHH','DOH', 25.273056, 51.608056),
  -- Romania
  ('airport:LROP','Romania','Bucharest',   'Henri Coandă International Airport',         'LROP','OTP', 44.571792, 26.103285),
  ('airport:LRCL','Romania','Cluj-Napoca', 'Cluj-Napoca International Airport',          'LRCL','CLJ', 46.786042, 23.685733),
  ('airport:LRTR','Romania','Timișoara',   'Timișoara Traian Vuia International Airport','LRTR','TSR', 45.809898, 21.337900),
  -- Russia
  ('airport:UUEE','Russia','Moscow',          'Sheremetyevo International Airport','UUEE','SVO', 55.976858, 37.411210),
  ('airport:UUDD','Russia','Moscow',          'Domodedovo International Airport',   'UUDD','DME', 55.408798, 37.906300),
  ('airport:ULLI','Russia','Saint Petersburg','Pulkovo Airport',                   'ULLI','LED', 59.800301, 30.262501),
  ('airport:UNNT','Russia','Novosibirsk',     'Tolmachevo Airport',                'UNNT','OVB', 55.019756, 82.618675),
  ('airport:USSS','Russia','Yekaterinburg',   'Koltsovo Airport',                  'USSS','SVX', 56.743099, 60.802700),
  -- Saudi Arabia
  ('airport:OERK','Saudi Arabia','Riyadh', 'King Khalid International Airport',        'OERK','RUH', 24.957600, 46.698799),
  ('airport:OEJN','Saudi Arabia','Jeddah', 'King Abdulaziz International Airport',     'OEJN','JED', 21.680241, 39.157436),
  ('airport:OEDF','Saudi Arabia','Dammam', 'King Fahd International Airport',          'OEDF','DMM', 26.469100, 49.798209),
  ('airport:OEMA','Saudi Arabia','Medina', 'Prince Mohammad Bin Abdulaziz Airport',    'OEMA','MED', 24.553400, 39.705101),
  -- Singapore
  ('airport:WSSS','Singapore','Singapore','Singapore Changi Airport','WSSS','SIN',  1.350190, 103.994003),
  -- South Africa
  ('airport:FAOR','South Africa','Johannesburg','O.R. Tambo International Airport', 'FAOR','JNB',-26.140081, 28.246801),
  ('airport:FACT','South Africa','Cape Town',   'Cape Town International Airport',  'FACT','CPT',-33.974030, 18.604333),
  ('airport:FALE','South Africa','Durban',      'King Shaka International Airport', 'FALE','DUR',-29.614444, 31.119722),
  ('airport:FAWB','South Africa','Pretoria',    'Wonderboom Airport',               'FAWB','PRY',-25.653900, 28.224199),
  -- South Korea
  ('airport:RKSI','South Korea','Seoul', 'Incheon International Airport','RKSI','ICN', 37.469101, 126.450996),
  ('airport:RKSS','South Korea','Seoul', 'Gimpo International Airport',  'RKSS','GMP', 37.558300, 126.791000),
  ('airport:RKPK','South Korea','Busan', 'Gimhae International Airport', 'RKPK','PUS', 35.179501, 128.938004),
  ('airport:RKPC','South Korea','Jeju',  'Jeju International Airport',   'RKPC','CJU', 33.512058, 126.492548),
  -- Spain
  ('airport:LEMD','Spain','Madrid',           'Adolfo Suárez Madrid–Barajas Airport',      'LEMD','MAD', 40.493407, -3.572249),
  ('airport:LEBL','Spain','Barcelona',         'Josep Tarradellas Barcelona–El Prat Airport','LEBL','BCN', 41.297100,  2.078460),
  ('airport:LEPA','Spain','Palma de Mallorca', 'Palma de Mallorca Airport',                 'LEPA','PMI', 39.551701,  2.738810),
  ('airport:LEMG','Spain','Málaga',            'Málaga–Costa del Sol Airport',              'LEMG','AGP', 36.674900, -4.499110),
  ('airport:LEAL','Spain','Alicante',          'Alicante–Elche Miguel Hernández Airport',   'LEAL','ALC', 38.282200, -0.558156),
  ('airport:LEVC','Spain','Valencia',          'Valencia Airport',                           'LEVC','VLC', 39.489162, -0.480961),
  ('airport:LEZL','Spain','Seville',           'Seville Airport',                            'LEZL','SVQ', 37.417999, -5.893110),
  ('airport:LEBB','Spain','Bilbao',            'Bilbao Airport',                             'LEBB','BIO', 43.301102, -2.910610),
  -- Sweden
  ('airport:ESSA','Sweden','Stockholm', 'Stockholm Arlanda Airport',     'ESSA','ARN', 59.648490, 17.928829),
  ('airport:ESGG','Sweden','Gothenburg','Gothenburg Landvetter Airport', 'ESGG','GOT', 57.662800, 12.279800),
  ('airport:ESMS','Sweden','Malmö',     'Malmö Airport',                 'ESMS','MMX', 55.535564, 13.376327),
  -- Switzerland
  ('airport:LSZH','Switzerland','Zurich','Zurich Airport',                      'LSZH','ZRH', 47.458056,  8.548056),
  ('airport:LSGG','Switzerland','Geneva','Geneva Airport',                      'LSGG','GVA', 46.238098,  6.108950),
  ('airport:LFSB','Switzerland','Basel', 'EuroAirport Basel Mulhouse Freiburg', 'LFSB','BSL', 47.600680,  7.521117),
  -- Taiwan
  ('airport:RCTP','Taiwan','Taipei',    'Taiwan Taoyuan International Airport','RCTP','TPE', 25.077700, 121.233002),
  ('airport:RCSS','Taiwan','Taipei',    'Taipei Songshan Airport',             'RCSS','TSA', 25.067244, 121.552822),
  ('airport:RCKH','Taiwan','Kaohsiung', 'Kaohsiung International Airport',     'RCKH','KHH', 22.577101, 120.349998),
  -- Thailand
  ('airport:VTBS','Thailand','Bangkok',   'Suvarnabhumi Airport',             'VTBS','BKK', 13.681100, 100.747002),
  ('airport:VTBD','Thailand','Bangkok',   'Don Mueang International Airport', 'VTBD','DMK', 13.912600, 100.607002),
  ('airport:VTCC','Thailand','Chiang Mai','Chiang Mai International Airport', 'VTCC','CNX', 18.766800,  98.962601),
  ('airport:VTSP','Thailand','Phuket',    'Phuket International Airport',     'VTSP','HKT',  8.113257,  98.317400),
  -- Turkey
  ('airport:LTFM','Turkey','Istanbul','Istanbul Airport',                    'LTFM','IST', 41.274874, 28.732136),
  ('airport:LTFJ','Turkey','Istanbul','Sabiha Gökçen International Airport', 'LTFJ','SAW', 40.898602, 29.309200),
  ('airport:LTAC','Turkey','Ankara',  'Esenboğa Airport',                    'LTAC','ESB', 40.128101, 32.995098),
  ('airport:LTBJ','Turkey','Izmir',   'Adnan Menderes Airport',              'LTBJ','ADB', 38.292400, 27.157000),
  ('airport:LTAI','Turkey','Antalya', 'Antalya Airport',                     'LTAI','AYT', 36.898701, 30.800501),
  -- Ukraine
  ('airport:UKBB','Ukraine','Kyiv',   'Boryspil International Airport',                  'UKBB','KBP', 50.345001, 30.894699),
  ('airport:UKLL','Ukraine','Lviv',   'Lviv Danylo Halytskyi International Airport',     'UKLL','LWO', 49.812500, 23.956100),
  ('airport:UKOO','Ukraine','Odessa', 'Odessa International Airport',                    'UKOO','ODS', 46.427196, 30.672649),
  ('airport:UKHH','Ukraine','Kharkiv','Kharkiv International Airport',                   'UKHH','HRK', 49.926943, 36.290814),
  -- United Arab Emirates
  ('airport:OMDB','United Arab Emirates','Dubai',    'Dubai International Airport',      'OMDB','DXB', 25.249790, 55.370992),
  ('airport:OMAA','United Arab Emirates','Abu Dhabi', 'Abu Dhabi International Airport', 'OMAA','AUH', 24.440966, 54.649237),
  ('airport:OMDW','United Arab Emirates','Dubai',    'Al Maktoum International Airport', 'OMDW','DWC', 24.896171, 55.162350),
  ('airport:OMSJ','United Arab Emirates','Sharjah',  'Sharjah International Airport',   'OMSJ','SHJ', 25.328600, 55.517200),
  -- United Kingdom
  ('airport:EGLL','United Kingdom','London',    'Heathrow Airport',  'EGLL','LHR', 51.470748, -0.459909),
  ('airport:EGKK','United Kingdom','London',    'Gatwick Airport',   'EGKK','LGW', 51.148744, -0.185739),
  ('airport:EGSS','United Kingdom','London',    'Stansted Airport',  'EGSS','STN', 51.884998,  0.235000),
  ('airport:EGCC','United Kingdom','Manchester','Manchester Airport', 'EGCC','MAN', 53.349375, -2.279521),
  ('airport:EGBB','United Kingdom','Birmingham','Birmingham Airport', 'EGBB','BHX', 52.453899, -1.748030),
  ('airport:EGPH','United Kingdom','Edinburgh', 'Edinburgh Airport', 'EGPH','EDI', 55.950145, -3.372288),
  ('airport:EGPF','United Kingdom','Glasgow',   'Glasgow Airport',   'EGPF','GLA', 55.871899, -4.433060),
  ('airport:EGGD','United Kingdom','Bristol',   'Bristol Airport',   'EGGD','BRS', 51.382326, -2.716453),
  -- United States
  ('airport:KATL','United States','Atlanta',      'Hartsfield-Jackson Atlanta International Airport','KATL','ATL', 33.636700, -84.428101),
  ('airport:KPAE','United States','Everett',      'Paine Field',                                     'KPAE','PAE', 47.906300,-122.281600),
  ('airport:KLAX','United States','Los Angeles',  'Los Angeles International Airport',                'KLAX','LAX', 33.942501,-118.407997),
  ('airport:KORD','United States','Chicago',      'O''Hare International Airport',                    'KORD','ORD', 41.978600, -87.904800),
  ('airport:KDFW','United States','Dallas',       'Dallas/Fort Worth International Airport',          'KDFW','DFW', 32.896801, -97.038002),
  ('airport:KJFK','United States','New York',     'John F. Kennedy International Airport',            'KJFK','JFK', 40.639447, -73.779317),
  ('airport:KEWR','United States','New York',     'Newark Liberty International Airport',             'KEWR','EWR', 40.689400, -74.170545),
  ('airport:KMIA','United States','Miami',        'Miami International Airport',                      'KMIA','MIA', 25.796011, -80.289751),
  ('airport:KSFO','United States','San Francisco','San Francisco International Airport',              'KSFO','SFO', 37.619806,-122.374821),
  ('airport:KSEA','United States','Seattle',      'Seattle–Tacoma International Airport',             'KSEA','SEA', 47.447943,-122.310276),
  ('airport:KIAH','United States','Houston',      'George Bush Intercontinental Airport',             'KIAH','IAH', 29.984400, -95.341400),
  ('airport:KDEN','United States','Denver',       'Denver International Airport',                     'KDEN','DEN', 39.860027,-104.673792),
  ('airport:KPHX','United States','Phoenix',      'Phoenix Sky Harbor International Airport',         'KPHX','PHX', 33.435302,-112.005905),
  ('airport:KSDL','United States','Scottsdale',   'Scottsdale Airport',                               'KSDL','SCF', 33.622900,-111.910200),
  ('airport:KMSP','United States','Minneapolis',  'Minneapolis–Saint Paul International Airport',     'KMSP','MSP', 44.880081, -93.221741),
  ('airport:KDTW','United States','Detroit',      'Detroit Metropolitan Wayne County Airport',        'KDTW','DTW', 42.213770, -83.353786),
  -- Uruguay
  ('airport:SUMU','Uruguay','Montevideo','Carrasco International Airport','SUMU','MVD',-34.835647,-56.026497),
  -- Venezuela
  ('airport:SVMI','Venezuela','Caracas',   'Simón Bolívar International Airport',   'SVMI','CCS', 10.602214,-66.991174),
  ('airport:SVMC','Venezuela','Maracaibo', 'La Chinita International Airport',      'SVMC','MAR', 10.557542,-71.729307),
  ('airport:SVVA','Venezuela','Valencia',  'Arturo Michelena International Airport','SVVA','VLN', 10.149733,-67.928398);


-- ============================================================
-- 4. PROFILES + AUTH TRIGGER
-- ============================================================

CREATE TABLE profiles (
  id         UUID         PRIMARY KEY,
  email      TEXT         NOT NULL,
  role       app_role     NOT NULL,
  status     user_status  NOT NULL DEFAULT 'pending_verification',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Creates a profiles row whenever a user registers via Supabase Auth.
-- Client must pass role in signup metadata: { data: { role: 'technician' | 'company_user' } }
-- Defaults to 'technician' if metadata is absent.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'technician')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 5. UPDATED_AT HELPER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ============================================================
-- 6. TECHNICIAN TABLES
-- ============================================================

CREATE TABLE technician_profiles (
  id                   UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID                NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  anonymous_code       TEXT                NOT NULL UNIQUE,
  first_name           TEXT                NOT NULL,
  last_name            TEXT                NOT NULL,
  email                TEXT                NOT NULL,
  phone                TEXT,
  birth_date           DATE                NOT NULL,
  technician_type      TEXT                NOT NULL REFERENCES technician_types(code),
  location_city_id     TEXT                NOT NULL REFERENCES location_airports(id),
  availability         JSONB               NOT NULL DEFAULT '{"immediately": false, "available_from": null, "contract_types": []}',
  verification_status  verification_status NOT NULL DEFAULT 'pending',
  profile_completeness INT                 NOT NULL DEFAULT 0 CHECK (profile_completeness BETWEEN 0 AND 100),
  social_links         JSONB,
  created_at           TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE TABLE technician_licenses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID        NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  license_code  TEXT        NOT NULL REFERENCES license_categories(code),
  issued_at     DATE,
  expires_at    DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (technician_id, license_code)
);

CREATE TABLE technician_habilitations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id      UUID        NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  license_code       TEXT        NOT NULL REFERENCES license_categories(code),
  aircraft_type_code TEXT        NOT NULL REFERENCES aircraft_types(code),
  issued_at          DATE,
  expires_at         DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (technician_id, license_code, aircraft_type_code)
);

CREATE TABLE technician_aircraft_experience (
  id                 UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id      UUID             NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  aircraft_type_code TEXT             NOT NULL REFERENCES aircraft_types(code),
  value              DOUBLE PRECISION NOT NULL CHECK (value >= 0),
  unit               experience_unit  NOT NULL,
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT now(),
  UNIQUE (technician_id, aircraft_type_code)
);

CREATE TABLE documents (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id    UUID            NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  type             TEXT            NOT NULL,
  file_name        TEXT            NOT NULL,
  storage_path     TEXT            NOT NULL,
  status           document_status NOT NULL DEFAULT 'pending',
  uploaded_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  expires_at       TIMESTAMPTZ
);


-- ============================================================
-- 7. COMPANY TABLES
-- ============================================================

CREATE TABLE companies (
  id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT                NOT NULL,
  location_city_id    TEXT                NOT NULL REFERENCES location_airports(id),
  phone               TEXT,
  email               TEXT                NOT NULL,
  company_type        TEXT                NOT NULL REFERENCES company_types(code),
  verification_status verification_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE TABLE company_members (
  id         UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID                NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    UUID                NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       company_member_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ         NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id),
  UNIQUE (user_id)
);


-- ============================================================
-- 8. OFFERS + OFFER REQUIREMENT TABLES
-- ============================================================

CREATE TABLE offers (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                 TEXT         NOT NULL,
  description           TEXT         NOT NULL,
  contract_type         TEXT         NOT NULL REFERENCES contract_types(code),
  location_city_id      TEXT         NOT NULL REFERENCES location_airports(id),
  location_country      TEXT         NOT NULL,
  location_city         TEXT         NOT NULL,
  location_base_airport TEXT         NOT NULL,
  min_years_experience  INT          NOT NULL DEFAULT 0 CHECK (min_years_experience >= 0),
  status                offer_status NOT NULL DEFAULT 'draft',
  visible               BOOLEAN      NOT NULL DEFAULT false,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE offer_required_technician_types (
  offer_id             UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  technician_type_code TEXT NOT NULL REFERENCES technician_types(code),
  PRIMARY KEY (offer_id, technician_type_code)
);

CREATE TABLE offer_required_licenses (
  offer_id     UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  license_code TEXT NOT NULL REFERENCES license_categories(code),
  PRIMARY KEY (offer_id, license_code)
);

CREATE TABLE offer_required_aircraft_types (
  offer_id           UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  aircraft_type_code TEXT NOT NULL REFERENCES aircraft_types(code),
  PRIMARY KEY (offer_id, aircraft_type_code)
);


-- ============================================================
-- 9. OFFER REQUESTS + OFFER APPLICATIONS
-- ============================================================

CREATE TABLE offer_requests (
  id                UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID                 NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  technician_id     UUID                 NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  offer_id          UUID                 REFERENCES offers(id) ON DELETE SET NULL,
  status            offer_request_status NOT NULL DEFAULT 'pending',
  identity_revealed BOOLEAN              NOT NULL DEFAULT false,
  documents_unlocked BOOLEAN             NOT NULL DEFAULT false,
  message           TEXT,
  created_at        TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ          NOT NULL DEFAULT now()
);

CREATE TABLE offer_applications (
  id                 UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id      UUID                 NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  offer_id           UUID                 NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  company_id         UUID                 NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status             offer_request_status NOT NULL DEFAULT 'pending',
  identity_revealed  BOOLEAN              NOT NULL DEFAULT false,
  documents_unlocked BOOLEAN              NOT NULL DEFAULT false,
  cover_note         TEXT,
  created_at         TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ          NOT NULL DEFAULT now(),
  UNIQUE (technician_id, offer_id)
);


-- ============================================================
-- 10. CHAT ROOMS + MESSAGES
-- ============================================================

CREATE TABLE chat_rooms (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_request_id     UUID        REFERENCES offer_requests(id) ON DELETE CASCADE,
  offer_application_id UUID        REFERENCES offer_applications(id) ON DELETE CASCADE,
  technician_id        UUID        NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  company_id           UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_single_source CHECK (
    (offer_request_id IS NOT NULL AND offer_application_id IS NULL) OR
    (offer_request_id IS NULL AND offer_application_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_chat_rooms_offer_request
  ON chat_rooms(offer_request_id)
  WHERE offer_request_id IS NOT NULL;

CREATE UNIQUE INDEX idx_chat_rooms_offer_application
  ON chat_rooms(offer_application_id)
  WHERE offer_application_id IS NOT NULL;

CREATE TABLE chat_messages (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id             UUID        NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_company_member_id UUID        REFERENCES company_members(id) ON DELETE SET NULL,
  sender_role              sender_role NOT NULL,
  body                     TEXT        NOT NULL,
  sent_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_company_member_role CHECK (
    sender_company_member_id IS NULL OR sender_role = 'company'
  )
);


-- ============================================================
-- 11. ACTIVITY EVENTS + READS
-- ============================================================

CREATE TABLE activity_events (
  id                      UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  type                    activity_type            NOT NULL,
  recipient_scope         activity_recipient_scope NOT NULL,
  recipient_technician_id UUID                     REFERENCES technician_profiles(id) ON DELETE CASCADE,
  recipient_company_id    UUID                     REFERENCES companies(id) ON DELETE CASCADE,
  actor_profile_id        UUID                     REFERENCES profiles(id) ON DELETE SET NULL,
  entity_type             activity_entity_type     NOT NULL,
  entity_id               UUID                     NOT NULL,
  offer_id                UUID                     REFERENCES offers(id) ON DELETE SET NULL,
  metadata                JSONB                    NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ              NOT NULL DEFAULT now(),
  CONSTRAINT activity_events_recipient_check CHECK (
    (recipient_scope = 'technician' AND recipient_technician_id IS NOT NULL AND recipient_company_id IS NULL)
    OR
    (recipient_scope = 'company' AND recipient_company_id IS NOT NULL AND recipient_technician_id IS NULL)
  )
);

CREATE TABLE activity_reads (
  activity_event_id UUID        NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
  profile_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_event_id, profile_id)
);


-- ============================================================
-- 12. INDEXES
-- ============================================================

CREATE INDEX idx_technician_profiles_user_id       ON technician_profiles(user_id);
CREATE INDEX idx_technician_profiles_type          ON technician_profiles(technician_type);
CREATE INDEX idx_technician_profiles_verification  ON technician_profiles(verification_status);
CREATE INDEX idx_technician_profiles_location_city ON technician_profiles(location_city_id);

CREATE INDEX idx_location_airports_country_city    ON location_airports(country_name, city);
CREATE INDEX idx_location_airports_iata            ON location_airports(iata);

CREATE INDEX idx_technician_licenses_technician    ON technician_licenses(technician_id);
CREATE INDEX idx_technician_licenses_code          ON technician_licenses(license_code);
CREATE INDEX idx_technician_habil_technician       ON technician_habilitations(technician_id);
CREATE INDEX idx_aircraft_exp_technician           ON technician_aircraft_experience(technician_id);

CREATE INDEX idx_documents_technician              ON documents(technician_id);
CREATE INDEX idx_documents_status                 ON documents(status);

CREATE INDEX idx_companies_location_city          ON companies(location_city_id);
CREATE INDEX idx_company_members_company          ON company_members(company_id);
CREATE INDEX idx_company_members_user             ON company_members(user_id);

CREATE INDEX idx_offers_company                   ON offers(company_id);
CREATE INDEX idx_offers_status_visible            ON offers(status, visible);
CREATE INDEX idx_offers_contract_type             ON offers(contract_type);
CREATE INDEX idx_offers_location_city             ON offers(location_city_id);

CREATE INDEX idx_offer_requests_company           ON offer_requests(company_id);
CREATE INDEX idx_offer_requests_technician        ON offer_requests(technician_id);
CREATE INDEX idx_offer_requests_status            ON offer_requests(status);

CREATE INDEX idx_offer_applications_technician    ON offer_applications(technician_id);
CREATE INDEX idx_offer_applications_offer         ON offer_applications(offer_id);
CREATE INDEX idx_offer_applications_company       ON offer_applications(company_id);
CREATE INDEX idx_offer_applications_status        ON offer_applications(status);

CREATE INDEX idx_chat_rooms_technician            ON chat_rooms(technician_id);
CREATE INDEX idx_chat_rooms_company               ON chat_rooms(company_id);
CREATE INDEX idx_chat_messages_room_sent          ON chat_messages(chat_room_id, sent_at);

CREATE INDEX idx_activity_events_tech_created     ON activity_events(recipient_technician_id, created_at DESC);
CREATE INDEX idx_activity_events_company_created  ON activity_events(recipient_company_id, created_at DESC);
CREATE INDEX idx_activity_events_entity           ON activity_events(entity_type, entity_id);
CREATE INDEX idx_activity_events_offer            ON activity_events(offer_id);
CREATE INDEX idx_activity_reads_profile           ON activity_reads(profile_id);


-- ============================================================
-- 13. AUTH HELPER FUNCTIONS + COMPUTE_AGE
-- ============================================================

CREATE OR REPLACE FUNCTION compute_age(birth_date DATE)
RETURNS INT LANGUAGE SQL IMMUTABLE AS $$
  SELECT DATE_PART('year', AGE(CURRENT_DATE, birth_date))::INT
$$;

-- All helper functions are SECURITY DEFINER to bypass RLS on the tables they query.
-- Without SECURITY DEFINER, calling these functions inside RLS policies causes infinite
-- recursion (e.g., a company_members policy calls my_company_id(), which queries
-- company_members, which triggers the policy again).
-- SET search_path = public prevents search_path injection attacks.

CREATE OR REPLACE FUNCTION auth_role()
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_status()
RETURNS user_status
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT status FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_active_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT status = 'active' FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role = 'admin' FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION my_technician_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM technician_profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION my_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM company_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION my_company_role(cid uuid)
RETURNS company_member_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM company_members WHERE user_id = auth.uid() AND company_id = cid
$$;

CREATE OR REPLACE FUNCTION can_act_for_company(cid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role IN ('admin', 'recruiter')
  FROM company_members
  WHERE user_id = auth.uid() AND company_id = cid
$$;

CREATE OR REPLACE FUNCTION offer_accepted_between(cid uuid, tid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM offer_requests
    WHERE company_id = cid AND technician_id = tid AND status = 'accepted'
  ) OR EXISTS (
    SELECT 1 FROM offer_applications
    WHERE company_id = cid AND technician_id = tid AND status = 'accepted'
  )
$$;


-- ============================================================
-- 14. TECHNICIAN PUBLIC VIEW
-- Used by all company-facing technician queries.
-- Exposes identity fields only when an accepted offer exists.
--
-- Security model:
--   This view is intentionally SECURITY DEFINER (Postgres default for views).
--   There is NO company SELECT policy on the technician_profiles base table —
--   all company-side lookups must go through this view. If the view were
--   SECURITY INVOKER, company users would see no rows (no company SELECT
--   policy exists on the base table).
--
--   Anonymous / blocked / suspended access is blocked by the WHERE clause.
--   Column-level identity privacy is enforced by CASE WHEN offer_accepted_between().
--   Admin should query technician_profiles directly (via admin RLS policy).
-- ============================================================

CREATE OR REPLACE VIEW technician_public_view AS
SELECT
  tp.id,
  tp.anonymous_code,
  compute_age(tp.birth_date)             AS age,
  tp.technician_type,
  tp.location_city_id,
  loc.country_name                       AS country,
  loc.city,
  COALESCE(loc.iata, loc.icao)           AS base_airport,
  loc.latitude,
  loc.longitude,
  tp.availability,
  tp.verification_status,
  tp.profile_completeness,
  CASE WHEN offer_accepted_between(my_company_id(), tp.id)
    THEN tp.first_name   ELSE NULL END   AS first_name,
  CASE WHEN offer_accepted_between(my_company_id(), tp.id)
    THEN tp.last_name    ELSE NULL END   AS last_name,
  CASE WHEN offer_accepted_between(my_company_id(), tp.id)
    THEN tp.email        ELSE NULL END   AS email,
  CASE WHEN offer_accepted_between(my_company_id(), tp.id)
    THEN tp.phone        ELSE NULL END   AS phone,
  CASE WHEN offer_accepted_between(my_company_id(), tp.id)
    THEN tp.social_links ELSE NULL END   AS social_links
FROM technician_profiles tp
JOIN location_airports loc ON loc.id = tp.location_city_id
WHERE is_active_user();  -- blocks anonymous users (auth.uid() IS NULL) and blocked/suspended accounts


-- ============================================================
-- 15. ROW LEVEL SECURITY
-- ============================================================

-- ── Catalog tables (public read, admin write) ──────────────

ALTER TABLE technician_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY cat_tt_read  ON technician_types FOR SELECT USING (true);
CREATE POLICY cat_tt_admin ON technician_types FOR ALL    USING (is_admin());

ALTER TABLE license_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY cat_lc_read  ON license_categories FOR SELECT USING (true);
CREATE POLICY cat_lc_admin ON license_categories FOR ALL    USING (is_admin());

ALTER TABLE aircraft_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY cat_at_read  ON aircraft_types FOR SELECT USING (true);
CREATE POLICY cat_at_admin ON aircraft_types FOR ALL    USING (is_admin());

ALTER TABLE company_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY cat_ct_read  ON company_types FOR SELECT USING (true);
CREATE POLICY cat_ct_admin ON company_types FOR ALL    USING (is_admin());

ALTER TABLE contract_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY cat_crt_read  ON contract_types FOR SELECT USING (true);
CREATE POLICY cat_crt_admin ON contract_types FOR ALL    USING (is_admin());

-- ── location_airports (public read, admin write) ───────────

ALTER TABLE location_airports ENABLE ROW LEVEL SECURITY;
CREATE POLICY loc_read  ON location_airports FOR SELECT USING (true);
CREATE POLICY loc_admin ON location_airports FOR ALL    USING (is_admin());

-- ── profiles ───────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY profiles_select_admin ON profiles
  FOR SELECT USING (is_admin());

CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_admin ON profiles
  FOR UPDATE USING (is_admin());

-- ── technician_profiles ────────────────────────────────────
-- Companies must NEVER query this table directly.
-- Use technician_public_view for all company-side lookups.

ALTER TABLE technician_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tp_select_own ON technician_profiles
  FOR SELECT USING (user_id = auth.uid() AND is_active_user());

CREATE POLICY tp_update_own ON technician_profiles
  FOR UPDATE USING (user_id = auth.uid() AND is_active_user())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY tp_insert_own ON technician_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid() AND is_active_user());

CREATE POLICY tp_select_admin ON technician_profiles
  FOR SELECT USING (is_admin());

CREATE POLICY tp_all_admin ON technician_profiles
  FOR ALL USING (is_admin());

-- ── technician_licenses ────────────────────────────────────

ALTER TABLE technician_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY tl_select_own ON technician_licenses
  FOR SELECT USING (technician_id = my_technician_id() AND is_active_user());

CREATE POLICY tl_insert_own ON technician_licenses
  FOR INSERT WITH CHECK (technician_id = my_technician_id() AND is_active_user());

CREATE POLICY tl_delete_own ON technician_licenses
  FOR DELETE USING (technician_id = my_technician_id());

CREATE POLICY tl_select_company ON technician_licenses
  FOR SELECT USING (auth_role() = 'company_user' AND is_active_user());

CREATE POLICY tl_all_admin ON technician_licenses
  FOR ALL USING (is_admin());

-- ── technician_habilitations ───────────────────────────────

ALTER TABLE technician_habilitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY th_select_own ON technician_habilitations
  FOR SELECT USING (technician_id = my_technician_id() AND is_active_user());

CREATE POLICY th_insert_own ON technician_habilitations
  FOR INSERT WITH CHECK (technician_id = my_technician_id() AND is_active_user());

CREATE POLICY th_delete_own ON technician_habilitations
  FOR DELETE USING (technician_id = my_technician_id());

CREATE POLICY th_select_company ON technician_habilitations
  FOR SELECT USING (auth_role() = 'company_user' AND is_active_user());

CREATE POLICY th_all_admin ON technician_habilitations
  FOR ALL USING (is_admin());

-- ── technician_aircraft_experience ────────────────────────

ALTER TABLE technician_aircraft_experience ENABLE ROW LEVEL SECURITY;

CREATE POLICY tae_select_own ON technician_aircraft_experience
  FOR SELECT USING (technician_id = my_technician_id() AND is_active_user());

CREATE POLICY tae_insert_own ON technician_aircraft_experience
  FOR INSERT WITH CHECK (technician_id = my_technician_id() AND is_active_user());

CREATE POLICY tae_delete_own ON technician_aircraft_experience
  FOR DELETE USING (technician_id = my_technician_id());

CREATE POLICY tae_select_company ON technician_aircraft_experience
  FOR SELECT USING (auth_role() = 'company_user' AND is_active_user());

CREATE POLICY tae_all_admin ON technician_aircraft_experience
  FOR ALL USING (is_admin());

-- ── documents ──────────────────────────────────────────────

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY docs_select_own ON documents
  FOR SELECT USING (technician_id = my_technician_id() AND is_active_user());

CREATE POLICY docs_insert_own ON documents
  FOR INSERT WITH CHECK (technician_id = my_technician_id() AND is_active_user());

CREATE POLICY docs_select_company ON documents
  FOR SELECT USING (
    auth_role() = 'company_user'
    AND is_active_user()
    AND documents.status = 'verified'
    AND (
      EXISTS (
        SELECT 1 FROM offer_requests orq
        WHERE orq.company_id = my_company_id()
          AND orq.technician_id = documents.technician_id
          AND orq.documents_unlocked = true
      )
      OR EXISTS (
        SELECT 1 FROM offer_applications oa
        WHERE oa.company_id = my_company_id()
          AND oa.technician_id = documents.technician_id
          AND oa.documents_unlocked = true
      )
    )
  );

CREATE POLICY docs_all_admin ON documents
  FOR ALL USING (is_admin());

-- ── companies ──────────────────────────────────────────────

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select_all ON companies
  FOR SELECT USING (is_active_user() AND verification_status = 'verified');

CREATE POLICY companies_update_own ON companies
  FOR UPDATE USING (is_active_user() AND my_company_role(id) = 'admin');

CREATE POLICY companies_all_admin ON companies
  FOR ALL USING (is_admin());

-- ── company_members ────────────────────────────────────────

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY cm_select_own_company ON company_members
  FOR SELECT USING (is_active_user() AND company_id = my_company_id());

CREATE POLICY cm_insert_admin ON company_members
  FOR INSERT WITH CHECK (is_active_user() AND my_company_role(company_id) = 'admin');

CREATE POLICY cm_update_admin ON company_members
  FOR UPDATE USING (is_active_user() AND my_company_role(company_id) = 'admin');

CREATE POLICY cm_delete_admin ON company_members
  FOR DELETE USING (is_active_user() AND my_company_role(company_id) = 'admin');

CREATE POLICY cm_all_admin ON company_members
  FOR ALL USING (is_admin());

-- ── offers ─────────────────────────────────────────────────

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY offers_select_published ON offers
  FOR SELECT USING (is_active_user() AND status = 'published' AND visible = true);

CREATE POLICY offers_select_own ON offers
  FOR SELECT USING (is_active_user() AND company_id = my_company_id());

CREATE POLICY offers_insert_company ON offers
  FOR INSERT WITH CHECK (is_active_user() AND can_act_for_company(company_id));

CREATE POLICY offers_update_company ON offers
  FOR UPDATE USING (is_active_user() AND can_act_for_company(company_id));

CREATE POLICY offers_all_admin ON offers
  FOR ALL USING (is_admin());

-- ── offer_required_technician_types ───────────────────────

ALTER TABLE offer_required_technician_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY ort_select_published ON offer_required_technician_types
  FOR SELECT USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_technician_types.offer_id
        AND o.status = 'published' AND o.visible = true
    )
  );

CREATE POLICY ort_select_own_company ON offer_required_technician_types
  FOR SELECT USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_technician_types.offer_id
        AND o.company_id = my_company_id()
    )
  );

CREATE POLICY ort_insert_company ON offer_required_technician_types
  FOR INSERT WITH CHECK (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_technician_types.offer_id
        AND can_act_for_company(o.company_id)
    )
  );

CREATE POLICY ort_delete_company ON offer_required_technician_types
  FOR DELETE USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_technician_types.offer_id
        AND can_act_for_company(o.company_id)
    )
  );

CREATE POLICY ort_all_admin ON offer_required_technician_types
  FOR ALL USING (is_admin());

-- ── offer_required_licenses ────────────────────────────────

ALTER TABLE offer_required_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY orl_select_published ON offer_required_licenses
  FOR SELECT USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_licenses.offer_id
        AND o.status = 'published' AND o.visible = true
    )
  );

CREATE POLICY orl_select_own_company ON offer_required_licenses
  FOR SELECT USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_licenses.offer_id
        AND o.company_id = my_company_id()
    )
  );

CREATE POLICY orl_insert_company ON offer_required_licenses
  FOR INSERT WITH CHECK (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_licenses.offer_id
        AND can_act_for_company(o.company_id)
    )
  );

CREATE POLICY orl_delete_company ON offer_required_licenses
  FOR DELETE USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_licenses.offer_id
        AND can_act_for_company(o.company_id)
    )
  );

CREATE POLICY orl_all_admin ON offer_required_licenses
  FOR ALL USING (is_admin());

-- ── offer_required_aircraft_types ─────────────────────────

ALTER TABLE offer_required_aircraft_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY ora_select_published ON offer_required_aircraft_types
  FOR SELECT USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_aircraft_types.offer_id
        AND o.status = 'published' AND o.visible = true
    )
  );

CREATE POLICY ora_select_own_company ON offer_required_aircraft_types
  FOR SELECT USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_aircraft_types.offer_id
        AND o.company_id = my_company_id()
    )
  );

CREATE POLICY ora_insert_company ON offer_required_aircraft_types
  FOR INSERT WITH CHECK (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_aircraft_types.offer_id
        AND can_act_for_company(o.company_id)
    )
  );

CREATE POLICY ora_delete_company ON offer_required_aircraft_types
  FOR DELETE USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_aircraft_types.offer_id
        AND can_act_for_company(o.company_id)
    )
  );

CREATE POLICY ora_all_admin ON offer_required_aircraft_types
  FOR ALL USING (is_admin());

-- ── offer_requests ─────────────────────────────────────────

ALTER TABLE offer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY or_select_company ON offer_requests
  FOR SELECT USING (is_active_user() AND company_id = my_company_id());

CREATE POLICY or_insert_company ON offer_requests
  FOR INSERT WITH CHECK (is_active_user() AND can_act_for_company(company_id));

CREATE POLICY or_update_company ON offer_requests
  FOR UPDATE USING (is_active_user() AND can_act_for_company(company_id));

CREATE POLICY or_select_technician ON offer_requests
  FOR SELECT USING (is_active_user() AND technician_id = my_technician_id());

CREATE POLICY or_update_technician ON offer_requests
  FOR UPDATE USING (is_active_user() AND technician_id = my_technician_id())
  WITH CHECK (technician_id = my_technician_id());

CREATE POLICY or_all_admin ON offer_requests
  FOR ALL USING (is_admin());

-- ── offer_applications ─────────────────────────────────────

ALTER TABLE offer_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY oa_select_technician ON offer_applications
  FOR SELECT USING (is_active_user() AND technician_id = my_technician_id());

CREATE POLICY oa_insert_technician ON offer_applications
  FOR INSERT WITH CHECK (is_active_user() AND technician_id = my_technician_id());

CREATE POLICY oa_update_technician ON offer_applications
  FOR UPDATE USING (is_active_user() AND technician_id = my_technician_id());

CREATE POLICY oa_select_company ON offer_applications
  FOR SELECT USING (is_active_user() AND company_id = my_company_id());

CREATE POLICY oa_update_company ON offer_applications
  FOR UPDATE USING (is_active_user() AND can_act_for_company(company_id));

CREATE POLICY oa_all_admin ON offer_applications
  FOR ALL USING (is_admin());

-- ── chat_rooms ─────────────────────────────────────────────

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY cr_select_technician ON chat_rooms
  FOR SELECT USING (is_active_user() AND technician_id = my_technician_id());

CREATE POLICY cr_select_company ON chat_rooms
  FOR SELECT USING (is_active_user() AND company_id = my_company_id());

CREATE POLICY cr_all_admin ON chat_rooms
  FOR ALL USING (is_admin());

-- ── chat_messages ──────────────────────────────────────────

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY cm_msg_select_participant ON chat_messages
  FOR SELECT USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM chat_rooms cr
      WHERE cr.id = chat_messages.chat_room_id
        AND (cr.technician_id = my_technician_id() OR cr.company_id = my_company_id())
    )
  );

CREATE POLICY cm_msg_insert_technician ON chat_messages
  FOR INSERT WITH CHECK (
    is_active_user()
    AND sender_user_id = auth.uid()
    AND sender_role = 'technician'
    AND sender_company_member_id IS NULL
    AND EXISTS (
      SELECT 1 FROM chat_rooms cr
      WHERE cr.id = chat_messages.chat_room_id
        AND cr.technician_id = my_technician_id()
    )
  );

CREATE POLICY cm_msg_insert_company ON chat_messages
  FOR INSERT WITH CHECK (
    is_active_user()
    AND sender_user_id = auth.uid()
    AND sender_role = 'company'
    AND EXISTS (
      SELECT 1 FROM chat_rooms cr
      JOIN company_members mem
        ON mem.company_id = cr.company_id
       AND mem.user_id = auth.uid()
       AND mem.role IN ('admin', 'recruiter')
      WHERE cr.id = chat_messages.chat_room_id
        AND cr.company_id = my_company_id()
        AND can_act_for_company(cr.company_id)
        AND (
          chat_messages.sender_company_member_id IS NULL
          OR chat_messages.sender_company_member_id = mem.id
        )
    )
  );

CREATE POLICY cm_msg_all_admin ON chat_messages
  FOR ALL USING (is_admin());

-- ── activity_events ────────────────────────────────────────

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ae_select_technician ON activity_events
  FOR SELECT USING (
    is_active_user()
    AND recipient_scope = 'technician'
    AND recipient_technician_id = my_technician_id()
  );

CREATE POLICY ae_select_company ON activity_events
  FOR SELECT USING (
    is_active_user()
    AND recipient_scope = 'company'
    AND recipient_company_id = my_company_id()
  );

CREATE POLICY ae_all_admin ON activity_events
  FOR ALL USING (is_admin());

-- ── activity_reads ─────────────────────────────────────────

ALTER TABLE activity_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY ar_select_own ON activity_reads
  FOR SELECT USING (is_active_user() AND profile_id = auth.uid());

CREATE POLICY ar_insert_own ON activity_reads
  FOR INSERT WITH CHECK (
    is_active_user()
    AND profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM activity_events ae
      WHERE ae.id = activity_reads.activity_event_id
        AND (
          (ae.recipient_scope = 'technician' AND ae.recipient_technician_id = my_technician_id())
          OR
          (ae.recipient_scope = 'company'    AND ae.recipient_company_id    = my_company_id())
        )
    )
  );

CREATE POLICY ar_delete_own ON activity_reads
  FOR DELETE USING (is_active_user() AND profile_id = auth.uid());

CREATE POLICY ar_all_admin ON activity_reads
  FOR ALL USING (is_admin());


-- ============================================================
-- 16. OFFER ACCEPTANCE TRIGGER
-- Validates status transitions, sets identity_revealed +
-- documents_unlocked, and creates the chat room atomically.
-- Runs SECURITY DEFINER so it can INSERT into chat_rooms
-- even though clients have no INSERT policy on that table.
-- ============================================================

CREATE OR REPLACE FUNCTION assert_offer_relation_transition(
  old_status offer_request_status,
  new_status offer_request_status
)
RETURNS void AS $$
BEGIN
  IF old_status = new_status THEN RETURN; END IF;

  IF old_status <> 'pending' THEN
    RAISE EXCEPTION 'Terminal status cannot transition: % → %', old_status, new_status;
  END IF;

  IF new_status NOT IN ('accepted', 'rejected', 'expired', 'withdrawn') THEN
    RAISE EXCEPTION 'Invalid status transition: % → %', old_status, new_status;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION handle_offer_relation_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM assert_offer_relation_transition(OLD.status, NEW.status);

  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    NEW.identity_revealed  := true;
    NEW.documents_unlocked := true;

    IF TG_TABLE_NAME = 'offer_requests' THEN
      INSERT INTO chat_rooms (offer_request_id, technician_id, company_id)
      VALUES (NEW.id, NEW.technician_id, NEW.company_id)
      ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO chat_rooms (offer_application_id, technician_id, company_id)
      VALUES (NEW.id, NEW.technician_id, NEW.company_id)
      ON CONFLICT DO NOTHING;
    END IF;

  ELSIF NEW.status IN ('rejected', 'expired', 'withdrawn') THEN
    NEW.identity_revealed  := false;
    NEW.documents_unlocked := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_offer_request_transition
  BEFORE UPDATE ON offer_requests
  FOR EACH ROW EXECUTE FUNCTION handle_offer_relation_status_transition();

CREATE TRIGGER trigger_offer_application_transition
  BEFORE UPDATE ON offer_applications
  FOR EACH ROW EXECUTE FUNCTION handle_offer_relation_status_transition();


-- ============================================================
-- 17. UPDATED_AT TRIGGERS
-- ============================================================

CREATE TRIGGER set_updated_at_technician_profiles
  BEFORE UPDATE ON technician_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_companies
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_offers
  BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_offer_requests
  BEFORE UPDATE ON offer_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_offer_applications
  BEFORE UPDATE ON offer_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
