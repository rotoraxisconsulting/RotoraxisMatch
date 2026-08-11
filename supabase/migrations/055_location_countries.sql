-- ============================================================
-- AviationJobTalent V2 — Migración 055: catálogo de países
-- ============================================================
-- Created: 2026-08-11 (Fase 7, tanda F1 — docs/MISSION_PART66.md)
--
-- Esta migración SOLO CREA. No borra, no altera y no toca una sola fila
-- existente. Es la mitad de EXPANSIÓN del expand-contract: al aplicarla la
-- app sigue exactamente igual porque todavía no hay ningún lector.
--
-- POR QUÉ
-- Hoy la localización se elige por aeropuerto (`location_airports`: 255
-- filas, 65 países). Eso deja fuera países con aviación real — de
-- Latinoamérica sólo hay 9, faltan Bolivia, Paraguay, Panamá, Costa Rica,
-- Guatemala y República Dominicana entre otros. Como el país va a ser lo
-- ÚNICO que puntúa en localización, la lista tiene que estar completa: 250
-- países, no los 65 que resultaron de haber elegido 255 aeropuertos.
--
-- DE DÓNDE SALEN LOS DATOS
-- Semilla: paquete npm `country-state-city@3.2.1`, fichero
-- `lib/assets/country.json` (isoCode, name, latitude, longitude).
-- ⚠ SE USA SÓLO COMO SEMILLA DE ESTA MIGRACIÓN. El paquete NO entra en
-- package.json ni en el bundle: si quedara en tiempo de ejecución habría dos
-- fuentes para el mismo dato, y la que gana sería la que se cargue antes.
-- Los valores están abajo literales; esta tabla es la única fuente.
--
-- LAS CIUDADES NO ESTÁN AQUÍ, Y ES DELIBERADO
-- No hay tabla de ciudades ni la va a haber. Se sirven en F2 desde la API
-- pública de countries.dev (GET /cities?q=...&country=XX), sin clave,
-- ordenadas por población e insensible a acentos. Mantener un catálogo de
-- ciudades del mundo en Postgres es asumir su mantenimiento para siempre a
-- cambio de nada.
--
-- `location_airports` NO SE TOCA
-- Su DROP va DESPUÉS del código de F2, cuando no queden lectores. Hoy hay
-- 27 ficheros y 113 usos apuntando ahí, incluidas 3 FK NOT NULL
-- (`technician_profiles`, `companies`, `offers`). Misma regla que la 045,
-- la 049, la 052 y la 054: primero el esquema nuevo, luego el código, y el
-- DROP del viejo al final.
--
-- SOBRE LOS CENTROIDES
-- Son el centro geográfico declarado por el paquete, redondeado a 6
-- decimales. Para países grandes se separan bastante de la media de sus
-- aeropuertos (Rusia 2886 km, Canadá 1337 km, Indonesia 1289 km) — es lo
-- esperable: la media de 5 aeropuertos no es el centro de un país, y ninguna
-- de las dos cifras es "la correcta". Se siembran tal cual, SIN corregir.
-- ⚠ 'UM' (United States Minor Outlying Islands) viene con (0, 0) en el
-- paquete, que es Null Island y no su posición real. Se siembra tal cual por
-- fidelidad a la fuente; si F2 lo pinta en un mapa, corregirlo o
-- desactivarlo ahí, con una migración propia y a la vista.
-- ============================================================


-- ── 1. El catálogo ─────────────────────────────────────────
--
-- La PK es el código ISO-3166-1 alpha-2, no un UUID ni un serial: es un
-- identificador estable, público y ya acordado por el resto del mundo, y es
-- además lo que la API de countries.dev espera en su parámetro `country`.
CREATE TABLE IF NOT EXISTS public.location_countries (
  code      TEXT             PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name      TEXT             NOT NULL UNIQUE,
  latitude  DOUBLE PRECISION NOT NULL CHECK (latitude  BETWEEN  -90 AND  90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_active BOOLEAN          NOT NULL DEFAULT true
);

COMMENT ON TABLE  public.location_countries IS
  'Catálogo de países (ISO-3166-1 alpha-2). Sustituye a location_airports como fuente de localización a partir de la Fase 7. Las ciudades NO viven aquí: se sirven de la API de countries.dev.';
COMMENT ON COLUMN public.location_countries.latitude IS
  'Centroide del país segun country-state-city@3.2.1, no la media de sus aeropuertos. Sirve para centrar un mapa, no para calcular distancias reales.';
COMMENT ON COLUMN public.location_countries.is_active IS
  'Los países obsoletos se desactivan, nunca se borran: hay perfiles y ofertas apuntando a su código.';


-- ── 2. Los 250 países ──────────────────────────────────────
--
-- ON CONFLICT DO NOTHING, no DO UPDATE: si alguien corrige a mano un
-- centroide, re-aplicar esta migración no debe deshacérselo.
INSERT INTO public.location_countries (code, name, latitude, longitude) VALUES
  ('AD', 'Andorra'                             ,   42.500000,     1.500000),
  ('AE', 'United Arab Emirates'                ,   24.000000,    54.000000),
  ('AF', 'Afghanistan'                         ,   33.000000,    65.000000),
  ('AG', 'Antigua And Barbuda'                 ,   17.050000,   -61.800000),
  ('AI', 'Anguilla'                            ,   18.250000,   -63.166667),
  ('AL', 'Albania'                             ,   41.000000,    20.000000),
  ('AM', 'Armenia'                             ,   40.000000,    45.000000),
  ('AO', 'Angola'                              ,  -12.500000,    18.500000),
  ('AQ', 'Antarctica'                          ,  -74.650000,     4.480000),
  ('AR', 'Argentina'                           ,  -34.000000,   -64.000000),
  ('AS', 'American Samoa'                      ,  -14.333333,  -170.000000),
  ('AT', 'Austria'                             ,   47.333333,    13.333333),
  ('AU', 'Australia'                           ,  -27.000000,   133.000000),
  ('AW', 'Aruba'                               ,   12.500000,   -69.966667),
  ('AX', 'Aland Islands'                       ,   60.116667,    19.900000),
  ('AZ', 'Azerbaijan'                          ,   40.500000,    47.500000),
  ('BA', 'Bosnia and Herzegovina'              ,   44.000000,    18.000000),
  ('BB', 'Barbados'                            ,   13.166667,   -59.533333),
  ('BD', 'Bangladesh'                          ,   24.000000,    90.000000),
  ('BE', 'Belgium'                             ,   50.833333,     4.000000),
  ('BF', 'Burkina Faso'                        ,   13.000000,    -2.000000),
  ('BG', 'Bulgaria'                            ,   43.000000,    25.000000),
  ('BH', 'Bahrain'                             ,   26.000000,    50.550000),
  ('BI', 'Burundi'                             ,   -3.500000,    30.000000),
  ('BJ', 'Benin'                               ,    9.500000,     2.250000),
  ('BL', 'Saint-Barthelemy'                    ,   18.500000,   -63.416667),
  ('BM', 'Bermuda'                             ,   32.333333,   -64.750000),
  ('BN', 'Brunei'                              ,    4.500000,   114.666667),
  ('BO', 'Bolivia'                             ,  -17.000000,   -65.000000),
  ('BQ', 'Bonaire, Sint Eustatius and Saba'    ,   12.150000,   -68.266667),
  ('BR', 'Brazil'                              ,  -10.000000,   -55.000000),
  ('BS', 'The Bahamas'                         ,   24.250000,   -76.000000),
  ('BT', 'Bhutan'                              ,   27.500000,    90.500000),
  ('BV', 'Bouvet Island'                       ,  -54.433333,     3.400000),
  ('BW', 'Botswana'                            ,  -22.000000,    24.000000),
  ('BY', 'Belarus'                             ,   53.000000,    28.000000),
  ('BZ', 'Belize'                              ,   17.250000,   -88.750000),
  ('CA', 'Canada'                              ,   60.000000,   -95.000000),
  ('CC', 'Cocos (Keeling) Islands'             ,  -12.500000,    96.833333),
  ('CD', 'Democratic Republic of the Congo'    ,    0.000000,    25.000000),
  ('CF', 'Central African Republic'            ,    7.000000,    21.000000),
  ('CG', 'Congo'                               ,   -1.000000,    15.000000),
  ('CH', 'Switzerland'                         ,   47.000000,     8.000000),
  ('CI', 'Cote D''Ivoire (Ivory Coast)'        ,    8.000000,    -5.000000),
  ('CK', 'Cook Islands'                        ,  -21.233333,  -159.766667),
  ('CL', 'Chile'                               ,  -30.000000,   -71.000000),
  ('CM', 'Cameroon'                            ,    6.000000,    12.000000),
  ('CN', 'China'                               ,   35.000000,   105.000000),
  ('CO', 'Colombia'                            ,    4.000000,   -72.000000),
  ('CR', 'Costa Rica'                          ,   10.000000,   -84.000000),
  ('CU', 'Cuba'                                ,   21.500000,   -80.000000),
  ('CV', 'Cape Verde'                          ,   16.000000,   -24.000000),
  ('CW', 'Curaçao'                             ,   12.116667,   -68.933333),
  ('CX', 'Christmas Island'                    ,  -10.500000,   105.666667),
  ('CY', 'Cyprus'                              ,   35.000000,    33.000000),
  ('CZ', 'Czech Republic'                      ,   49.750000,    15.500000),
  ('DE', 'Germany'                             ,   51.000000,     9.000000),
  ('DJ', 'Djibouti'                            ,   11.500000,    43.000000),
  ('DK', 'Denmark'                             ,   56.000000,    10.000000),
  ('DM', 'Dominica'                            ,   15.416667,   -61.333333),
  ('DO', 'Dominican Republic'                  ,   19.000000,   -70.666667),
  ('DZ', 'Algeria'                             ,   28.000000,     3.000000),
  ('EC', 'Ecuador'                             ,   -2.000000,   -77.500000),
  ('EE', 'Estonia'                             ,   59.000000,    26.000000),
  ('EG', 'Egypt'                               ,   27.000000,    30.000000),
  ('EH', 'Western Sahara'                      ,   24.500000,   -13.000000),
  ('ER', 'Eritrea'                             ,   15.000000,    39.000000),
  ('ES', 'Spain'                               ,   40.000000,    -4.000000),
  ('ET', 'Ethiopia'                            ,    8.000000,    38.000000),
  ('FI', 'Finland'                             ,   64.000000,    26.000000),
  ('FJ', 'Fiji Islands'                        ,  -18.000000,   175.000000),
  ('FK', 'Falkland Islands'                    ,  -51.750000,   -59.000000),
  ('FM', 'Micronesia'                          ,    6.916667,   158.250000),
  ('FO', 'Faroe Islands'                       ,   62.000000,    -7.000000),
  ('FR', 'France'                              ,   46.000000,     2.000000),
  ('GA', 'Gabon'                               ,   -1.000000,    11.750000),
  ('GB', 'United Kingdom'                      ,   54.000000,    -2.000000),
  ('GD', 'Grenada'                             ,   12.116667,   -61.666667),
  ('GE', 'Georgia'                             ,   42.000000,    43.500000),
  ('GF', 'French Guiana'                       ,    4.000000,   -53.000000),
  ('GG', 'Guernsey and Alderney'               ,   49.466667,    -2.583333),
  ('GH', 'Ghana'                               ,    8.000000,    -2.000000),
  ('GI', 'Gibraltar'                           ,   36.133333,    -5.350000),
  ('GL', 'Greenland'                           ,   72.000000,   -40.000000),
  ('GM', 'The Gambia'                          ,   13.466667,   -16.566667),
  ('GN', 'Guinea'                              ,   11.000000,   -10.000000),
  ('GP', 'Guadeloupe'                          ,   16.250000,   -61.583333),
  ('GQ', 'Equatorial Guinea'                   ,    2.000000,    10.000000),
  ('GR', 'Greece'                              ,   39.000000,    22.000000),
  ('GS', 'South Georgia'                       ,  -54.500000,   -37.000000),
  ('GT', 'Guatemala'                           ,   15.500000,   -90.250000),
  ('GU', 'Guam'                                ,   13.466667,   144.783333),
  ('GW', 'Guinea-Bissau'                       ,   12.000000,   -15.000000),
  ('GY', 'Guyana'                              ,    5.000000,   -59.000000),
  ('HK', 'Hong Kong S.A.R.'                    ,   22.250000,   114.166667),
  ('HM', 'Heard Island and McDonald Islands'   ,  -53.100000,    72.516667),
  ('HN', 'Honduras'                            ,   15.000000,   -86.500000),
  ('HR', 'Croatia'                             ,   45.166667,    15.500000),
  ('HT', 'Haiti'                               ,   19.000000,   -72.416667),
  ('HU', 'Hungary'                             ,   47.000000,    20.000000),
  ('ID', 'Indonesia'                           ,   -5.000000,   120.000000),
  ('IE', 'Ireland'                             ,   53.000000,    -8.000000),
  ('IL', 'Israel'                              ,   31.500000,    34.750000),
  ('IM', 'Man (Isle of)'                       ,   54.250000,    -4.500000),
  ('IN', 'India'                               ,   20.000000,    77.000000),
  ('IO', 'British Indian Ocean Territory'      ,   -6.000000,    71.500000),
  ('IQ', 'Iraq'                                ,   33.000000,    44.000000),
  ('IR', 'Iran'                                ,   32.000000,    53.000000),
  ('IS', 'Iceland'                             ,   65.000000,   -18.000000),
  ('IT', 'Italy'                               ,   42.833333,    12.833333),
  ('JE', 'Jersey'                              ,   49.250000,    -2.166667),
  ('JM', 'Jamaica'                             ,   18.250000,   -77.500000),
  ('JO', 'Jordan'                              ,   31.000000,    36.000000),
  ('JP', 'Japan'                               ,   36.000000,   138.000000),
  ('KE', 'Kenya'                               ,    1.000000,    38.000000),
  ('KG', 'Kyrgyzstan'                          ,   41.000000,    75.000000),
  ('KH', 'Cambodia'                            ,   13.000000,   105.000000),
  ('KI', 'Kiribati'                            ,    1.416667,   173.000000),
  ('KM', 'Comoros'                             ,  -12.166667,    44.250000),
  ('KN', 'Saint Kitts And Nevis'               ,   17.333333,   -62.750000),
  ('KP', 'North Korea'                         ,   40.000000,   127.000000),
  ('KR', 'South Korea'                         ,   37.000000,   127.500000),
  ('KW', 'Kuwait'                              ,   29.500000,    45.750000),
  ('KY', 'Cayman Islands'                      ,   19.500000,   -80.500000),
  ('KZ', 'Kazakhstan'                          ,   48.000000,    68.000000),
  ('LA', 'Laos'                                ,   18.000000,   105.000000),
  ('LB', 'Lebanon'                             ,   33.833333,    35.833333),
  ('LC', 'Saint Lucia'                         ,   13.883333,   -60.966667),
  ('LI', 'Liechtenstein'                       ,   47.266667,     9.533333),
  ('LK', 'Sri Lanka'                           ,    7.000000,    81.000000),
  ('LR', 'Liberia'                             ,    6.500000,    -9.500000),
  ('LS', 'Lesotho'                             ,  -29.500000,    28.500000),
  ('LT', 'Lithuania'                           ,   56.000000,    24.000000),
  ('LU', 'Luxembourg'                          ,   49.750000,     6.166667),
  ('LV', 'Latvia'                              ,   57.000000,    25.000000),
  ('LY', 'Libya'                               ,   25.000000,    17.000000),
  ('MA', 'Morocco'                             ,   32.000000,    -5.000000),
  ('MC', 'Monaco'                              ,   43.733333,     7.400000),
  ('MD', 'Moldova'                             ,   47.000000,    29.000000),
  ('ME', 'Montenegro'                          ,   42.500000,    19.300000),
  ('MF', 'Saint-Martin (French part)'          ,   18.083333,   -63.950000),
  ('MG', 'Madagascar'                          ,  -20.000000,    47.000000),
  ('MH', 'Marshall Islands'                    ,    9.000000,   168.000000),
  ('MK', 'Macedonia'                           ,   41.833333,    22.000000),
  ('ML', 'Mali'                                ,   17.000000,    -4.000000),
  ('MM', 'Myanmar'                             ,   22.000000,    98.000000),
  ('MN', 'Mongolia'                            ,   46.000000,   105.000000),
  ('MO', 'Macau S.A.R.'                        ,   22.166667,   113.550000),
  ('MP', 'Northern Mariana Islands'            ,   15.200000,   145.750000),
  ('MQ', 'Martinique'                          ,   14.666667,   -61.000000),
  ('MR', 'Mauritania'                          ,   20.000000,   -12.000000),
  ('MS', 'Montserrat'                          ,   16.750000,   -62.200000),
  ('MT', 'Malta'                               ,   35.833333,    14.583333),
  ('MU', 'Mauritius'                           ,  -20.283333,    57.550000),
  ('MV', 'Maldives'                            ,    3.250000,    73.000000),
  ('MW', 'Malawi'                              ,  -13.500000,    34.000000),
  ('MX', 'Mexico'                              ,   23.000000,  -102.000000),
  ('MY', 'Malaysia'                            ,    2.500000,   112.500000),
  ('MZ', 'Mozambique'                          ,  -18.250000,    35.000000),
  ('NA', 'Namibia'                             ,  -22.000000,    17.000000),
  ('NC', 'New Caledonia'                       ,  -21.500000,   165.500000),
  ('NE', 'Niger'                               ,   16.000000,     8.000000),
  ('NF', 'Norfolk Island'                      ,  -29.033333,   167.950000),
  ('NG', 'Nigeria'                             ,   10.000000,     8.000000),
  ('NI', 'Nicaragua'                           ,   13.000000,   -85.000000),
  ('NL', 'Netherlands'                         ,   52.500000,     5.750000),
  ('NO', 'Norway'                              ,   62.000000,    10.000000),
  ('NP', 'Nepal'                               ,   28.000000,    84.000000),
  ('NR', 'Nauru'                               ,   -0.533333,   166.916667),
  ('NU', 'Niue'                                ,  -19.033333,  -169.866667),
  ('NZ', 'New Zealand'                         ,  -41.000000,   174.000000),
  ('OM', 'Oman'                                ,   21.000000,    57.000000),
  ('PA', 'Panama'                              ,    9.000000,   -80.000000),
  ('PE', 'Peru'                                ,  -10.000000,   -76.000000),
  ('PF', 'French Polynesia'                    ,  -15.000000,  -140.000000),
  ('PG', 'Papua new Guinea'                    ,   -6.000000,   147.000000),
  ('PH', 'Philippines'                         ,   13.000000,   122.000000),
  ('PK', 'Pakistan'                            ,   30.000000,    70.000000),
  ('PL', 'Poland'                              ,   52.000000,    20.000000),
  ('PM', 'Saint Pierre and Miquelon'           ,   46.833333,   -56.333333),
  ('PN', 'Pitcairn Island'                     ,  -25.066667,  -130.100000),
  ('PR', 'Puerto Rico'                         ,   18.250000,   -66.500000),
  ('PS', 'Palestinian Territory Occupied'      ,   31.900000,    35.200000),
  ('PT', 'Portugal'                            ,   39.500000,    -8.000000),
  ('PW', 'Palau'                               ,    7.500000,   134.500000),
  ('PY', 'Paraguay'                            ,  -23.000000,   -58.000000),
  ('QA', 'Qatar'                               ,   25.500000,    51.250000),
  ('RE', 'Reunion'                             ,  -21.150000,    55.500000),
  ('RO', 'Romania'                             ,   46.000000,    25.000000),
  ('RS', 'Serbia'                              ,   44.000000,    21.000000),
  ('RU', 'Russia'                              ,   60.000000,   100.000000),
  ('RW', 'Rwanda'                              ,   -2.000000,    30.000000),
  ('SA', 'Saudi Arabia'                        ,   25.000000,    45.000000),
  ('SB', 'Solomon Islands'                     ,   -8.000000,   159.000000),
  ('SC', 'Seychelles'                          ,   -4.583333,    55.666667),
  ('SD', 'Sudan'                               ,   15.000000,    30.000000),
  ('SE', 'Sweden'                              ,   62.000000,    15.000000),
  ('SG', 'Singapore'                           ,    1.366667,   103.800000),
  ('SH', 'Saint Helena'                        ,  -15.950000,    -5.700000),
  ('SI', 'Slovenia'                            ,   46.116667,    14.816667),
  ('SJ', 'Svalbard And Jan Mayen Islands'      ,   78.000000,    20.000000),
  ('SK', 'Slovakia'                            ,   48.666667,    19.500000),
  ('SL', 'Sierra Leone'                        ,    8.500000,   -11.500000),
  ('SM', 'San Marino'                          ,   43.766667,    12.416667),
  ('SN', 'Senegal'                             ,   14.000000,   -14.000000),
  ('SO', 'Somalia'                             ,   10.000000,    49.000000),
  ('SR', 'Suriname'                            ,    4.000000,   -56.000000),
  ('SS', 'South Sudan'                         ,    7.000000,    30.000000),
  ('ST', 'Sao Tome and Principe'               ,    1.000000,     7.000000),
  ('SV', 'El Salvador'                         ,   13.833333,   -88.916667),
  ('SX', 'Sint Maarten (Dutch part)'           ,   18.033333,   -63.050000),
  ('SY', 'Syria'                               ,   35.000000,    38.000000),
  ('SZ', 'Swaziland'                           ,  -26.500000,    31.500000),
  ('TC', 'Turks And Caicos Islands'            ,   21.750000,   -71.583333),
  ('TD', 'Chad'                                ,   15.000000,    19.000000),
  ('TF', 'French Southern Territories'         ,  -49.250000,    69.167000),
  ('TG', 'Togo'                                ,    8.000000,     1.166667),
  ('TH', 'Thailand'                            ,   15.000000,   100.000000),
  ('TJ', 'Tajikistan'                          ,   39.000000,    71.000000),
  ('TK', 'Tokelau'                             ,   -9.000000,  -172.000000),
  ('TL', 'East Timor'                          ,   -8.833333,   125.916667),
  ('TM', 'Turkmenistan'                        ,   40.000000,    60.000000),
  ('TN', 'Tunisia'                             ,   34.000000,     9.000000),
  ('TO', 'Tonga'                               ,  -20.000000,  -175.000000),
  ('TR', 'Turkey'                              ,   39.000000,    35.000000),
  ('TT', 'Trinidad And Tobago'                 ,   11.000000,   -61.000000),
  ('TV', 'Tuvalu'                              ,   -8.000000,   178.000000),
  ('TW', 'Taiwan'                              ,   23.500000,   121.000000),
  ('TZ', 'Tanzania'                            ,   -6.000000,    35.000000),
  ('UA', 'Ukraine'                             ,   49.000000,    32.000000),
  ('UG', 'Uganda'                              ,    1.000000,    32.000000),
  ('UM', 'United States Minor Outlying Islands',    0.000000,     0.000000),
  ('US', 'United States'                       ,   38.000000,   -97.000000),
  ('UY', 'Uruguay'                             ,  -33.000000,   -56.000000),
  ('UZ', 'Uzbekistan'                          ,   41.000000,    64.000000),
  ('VA', 'Vatican City State (Holy See)'       ,   41.900000,    12.450000),
  ('VC', 'Saint Vincent And The Grenadines'    ,   13.250000,   -61.200000),
  ('VE', 'Venezuela'                           ,    8.000000,   -66.000000),
  ('VG', 'Virgin Islands (British)'            ,   18.431383,   -64.623050),
  ('VI', 'Virgin Islands (US)'                 ,   18.340000,   -64.930000),
  ('VN', 'Vietnam'                             ,   16.166667,   107.833333),
  ('VU', 'Vanuatu'                             ,  -16.000000,   167.000000),
  ('WF', 'Wallis And Futuna Islands'           ,  -13.300000,  -176.200000),
  ('WS', 'Samoa'                               ,  -13.583333,  -172.333333),
  ('XK', 'Kosovo'                              ,   42.561291,    20.340304),
  ('YE', 'Yemen'                               ,   15.000000,    48.000000),
  ('YT', 'Mayotte'                             ,  -12.833333,    45.166667),
  ('ZA', 'South Africa'                        ,  -29.000000,    24.000000),
  ('ZM', 'Zambia'                              ,  -15.000000,    30.000000),
  ('ZW', 'Zimbabwe'                            ,  -20.000000,    30.000000)
ON CONFLICT (code) DO NOTHING;


-- ── 3. La correspondencia con el texto viejo ───────────────
--
-- `location_airports.country_name` es TEXTO LIBRE ('Spain', 'Côte d'Ivoire').
-- F2 tiene que convertir los 8 technician_profiles.location_city_id
-- existentes a un código de país, y necesita esta tabla para hacerlo sin
-- perder dato ni adivinar.
--
-- Es un PUENTE DE MIGRACIÓN, no catálogo: su ciclo de vida es el de
-- `location_airports`, y se dropea con ella cuando F2 haya terminado. Por eso
-- vive en su propia tabla y no como columna de location_countries, donde
-- 185 de 250 filas la tendrían a NULL para siempre.
--
-- 63 de los 65 nombres coinciden EXACTAMENTE con el nombre del paquete, así
-- que se derivan por JOIN en vez de teclearse: un JOIN no se puede
-- transcribir mal. Los 2 que no coinciden van explícitos abajo.
CREATE TABLE IF NOT EXISTS public.location_country_aliases (
  country_name TEXT PRIMARY KEY,
  country_code TEXT NOT NULL REFERENCES public.location_countries(code)
);

COMMENT ON TABLE public.location_country_aliases IS
  'PUENTE DE MIGRACIÓN, temporal: location_airports.country_name (texto libre) -> ISO alpha-2. Se dropea junto con location_airports cuando F2 no deje lectores. No añadir aquí alias de producto.';

INSERT INTO public.location_country_aliases (country_name, country_code)
SELECT DISTINCT la.country_name, lc.code
FROM public.location_airports la
JOIN public.location_countries lc ON lc.name = la.country_name
ON CONFLICT (country_name) DO NOTHING;

-- Los 2 que el JOIN no resuelve. Mismo país, distinta forma de escribirlo:
--   'Côte d'Ivoire' -> CI, que el paquete llama 'Cote D'Ivoire (Ivory Coast)'
--   'Hong Kong'     -> HK, que el paquete llama 'Hong Kong S.A.R.'
-- No hay ambigüedad en ninguno: CI y HK son entidades ISO-3166-1 por derecho
-- propio. En particular Hong Kong NO se colapsa en 'CN' — tiene su propio
-- código, su propia autoridad de aviación civil (CAD) y sus propias
-- licencias, que es justo lo que este producto cualifica.
INSERT INTO public.location_country_aliases (country_name, country_code) VALUES
  ('Côte d''Ivoire', 'CI'),
  ('Hong Kong',      'HK')
ON CONFLICT (country_name) DO NOTHING;


-- ── 4. Índices ─────────────────────────────────────────────
--
-- Sólo el de activos: el selector de país los lista filtrando por is_active,
-- y ordena por nombre. `code` y `name` ya tienen índice por PK y UNIQUE.
CREATE INDEX IF NOT EXISTS idx_location_countries_active
  ON public.location_countries(is_active, name);


-- ── 5. RLS ─────────────────────────────────────────────────
--
-- Idéntica a location_airports: lectura pública (el selector de país lo usa
-- el formulario de alta, antes de que haya sesión), escritura sólo admin.
ALTER TABLE public.location_countries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_country_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loc_country_read  ON public.location_countries;
DROP POLICY IF EXISTS loc_country_admin ON public.location_countries;
CREATE POLICY loc_country_read  ON public.location_countries FOR SELECT USING (true);
CREATE POLICY loc_country_admin ON public.location_countries FOR ALL    USING (is_admin());

DROP POLICY IF EXISTS loc_country_alias_read  ON public.location_country_aliases;
DROP POLICY IF EXISTS loc_country_alias_admin ON public.location_country_aliases;
CREATE POLICY loc_country_alias_read  ON public.location_country_aliases FOR SELECT USING (true);
CREATE POLICY loc_country_alias_admin ON public.location_country_aliases FOR ALL    USING (is_admin());


-- ── Post-condiciones ───────────────────────────────────────
--
-- Lo que se comprueba aquí es lo que F2 da por hecho. Si algo de esto falla,
-- F2 migraría perfiles a un país equivocado o los dejaría sin país.
DO $$
DECLARE
  v_countries  INT;
  v_aliases    INT;
  v_distinct   INT;
  v_orphan     TEXT;
  v_no_country INT;
BEGIN
  SELECT count(*) INTO v_countries FROM public.location_countries;
  IF v_countries <> 250 THEN
    RAISE EXCEPTION 'location_countries tiene % filas, se esperaban 250.', v_countries;
  END IF;

  -- Cobertura total: ningún país del catálogo viejo puede quedarse sin ISO,
  -- o F2 perdería las ofertas y perfiles que apunten ahí.
  SELECT count(DISTINCT country_name) INTO v_distinct FROM public.location_airports;
  SELECT count(*) INTO v_aliases FROM public.location_country_aliases;
  IF v_aliases <> v_distinct THEN
    SELECT string_agg(la.country_name, ', ') INTO v_orphan
    FROM (SELECT DISTINCT country_name FROM public.location_airports) la
    LEFT JOIN public.location_country_aliases a ON a.country_name = la.country_name
    WHERE a.country_name IS NULL;
    RAISE EXCEPTION
      'Hay % países en location_airports y sólo % alias. Sin correspondencia: %',
      v_distinct, v_aliases, COALESCE(v_orphan, '(ninguno: sobran alias)');
  END IF;

  -- Y la comprobación que de verdad importa: los perfiles que ya existen.
  SELECT count(*) INTO v_no_country
  FROM public.technician_profiles tp
  JOIN public.location_airports la ON la.id = tp.location_city_id
  LEFT JOIN public.location_country_aliases a ON a.country_name = la.country_name
  WHERE a.country_code IS NULL;
  IF v_no_country > 0 THEN
    RAISE EXCEPTION
      '% technician_profiles se quedarían sin país. F2 no puede migrarlos.',
      v_no_country;
  END IF;

  RAISE NOTICE
    'location_countries: % países, % alias cubriendo los % de location_airports; 0 perfiles sin país.',
    v_countries, v_aliases, v_distinct;
END $$;
