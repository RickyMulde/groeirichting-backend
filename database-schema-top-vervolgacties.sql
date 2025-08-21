-- Database Schema voor Top 3 Vervolgacties
-- Uitvoeren in Supabase SQL Editor

-- Maak nieuwe tabel voor top 3 vervolgacties
CREATE TABLE IF NOT EXISTS top_vervolgacties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  werknemer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  werkgever_id UUID REFERENCES users(id) ON DELETE CASCADE,
  periode VARCHAR(7) NOT NULL, -- YYYY-MM formaat
  
  -- Top 3 acties
  actie_1 TEXT NOT NULL,
  actie_2 TEXT NOT NULL,
  actie_3 TEXT NOT NULL,
  
  -- Prioriteitsniveaus
  prioriteit_1 VARCHAR(10) NOT NULL CHECK (prioriteit_1 IN ('hoog', 'medium', 'laag')),
  prioriteit_2 VARCHAR(10) NOT NULL CHECK (prioriteit_2 IN ('hoog', 'medium', 'laag')),
  prioriteit_3 VARCHAR(10) NOT NULL CHECK (prioriteit_3 IN ('hoog', 'medium', 'laag')),
  
  -- Toelichtingen
  toelichting_per_actie TEXT[] NOT NULL, -- Array van 3 toelichtingen
  algemene_toelichting TEXT,
  
  -- Metadata
  gegenereerd_op TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  gesprek_ids UUID[] NOT NULL, -- Array van alle betrokken gesprek IDs
  
  -- Constraints
  UNIQUE(werknemer_id, periode)
);

-- Maak indexen voor betere performance
CREATE INDEX IF NOT EXISTS idx_top_vervolgacties_werknemer_periode 
ON top_vervolgacties(werknemer_id, periode);

CREATE INDEX IF NOT EXISTS idx_top_vervolgacties_werkgever 
ON top_vervolgacties(werkgever_id);

CREATE INDEX IF NOT EXISTS idx_top_vervolgacties_gegenereerd_op 
ON top_vervolgacties(gegenereerd_op);

-- Voeg RLS (Row Level Security) toe
ALTER TABLE top_vervolgacties ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Werknemers kunnen alleen hun eigen top acties zien
CREATE POLICY "Werknemers kunnen eigen top acties zien" ON top_vervolgacties
  FOR SELECT USING (werknemer_id = auth.uid());

-- Werkgevers kunnen top acties van hun werknemers zien
CREATE POLICY "Werkgevers kunnen top acties van werknemers zien" ON top_vervolgacties
  FOR SELECT USING (
    werkgever_id IN (
      SELECT employer_id FROM users WHERE id = auth.uid()
    )
  );

-- Alleen service role kan inserten/updaten
CREATE POLICY "Service role kan alles" ON top_vervolgacties
  FOR ALL USING (auth.role() = 'service_role');

-- Voeg commentaar toe aan tabel en kolommen
COMMENT ON TABLE top_vervolgacties IS 'Top 3 vervolgacties gegenereerd door AI op basis van alle gesprekken van alle thema''s';
COMMENT ON COLUMN top_vervolgacties.werknemer_id IS 'ID van de werknemer waarvoor de top acties zijn gegenereerd';
COMMENT ON COLUMN top_vervolgacties.werkgever_id IS 'ID van de werkgever van de werknemer';
COMMENT ON COLUMN top_vervolgacties.periode IS 'Periode in YYYY-MM formaat waarvoor de acties gelden';
COMMENT ON COLUMN top_vervolgacties.actie_1 IS 'Eerste prioriteit actie (hoogste urgentie)';
COMMENT ON COLUMN top_vervolgacties.actie_2 IS 'Tweede prioriteit actie (medium urgentie)';
COMMENT ON COLUMN top_vervolgacties.actie_3 IS 'Derde prioriteit actie (laagste urgentie)';
COMMENT ON COLUMN top_vervolgacties.prioriteit_1 IS 'Prioriteitsniveau van eerste actie (hoog/medium/laag)';
COMMENT ON COLUMN top_vervolgacties.prioriteit_2 IS 'Prioriteitsniveau van tweede actie (hoog/medium/laag)';
COMMENT ON COLUMN top_vervolgacties.prioriteit_3 IS 'Prioriteitsniveau van derde actie (hoog/medium/laag)';
COMMENT ON COLUMN top_vervolgacties.toelichting_per_actie IS 'Array van 3 toelichtingen, één per actie';
COMMENT ON COLUMN top_vervolgacties.algemene_toelichting IS 'Algemene toelichting waarom deze 3 acties de beste keuzes zijn';
COMMENT ON COLUMN top_vervolgacties.gegenereerd_op IS 'Timestamp wanneer de top acties zijn gegenereerd';
COMMENT ON COLUMN top_vervolgacties.gesprek_ids IS 'Array van alle gesprek IDs die zijn gebruikt voor generatie';

-- Test data (optioneel, verwijderen na testen)
-- INSERT INTO top_vervolgacties (
--   werknemer_id,
--   werkgever_id,
--   periode,
--   actie_1,
--   actie_2,
--   actie_3,
--   prioriteit_1,
--   prioriteit_2,
--   prioriteit_3,
--   toelichting_per_actie,
--   algemene_toelichting,
--   gesprek_ids
-- ) VALUES (
--   '00000000-0000-0000-0000-000000000001', -- vervang door echte UUID
--   '00000000-0000-0000-0000-000000000002', -- vervang door echte UUID
--   '2024-03',
--   'Plan een gesprek met je leidinggevende over je werkdruk en energiemanagement',
--   'Zoek een workshop over time management en prioriteiten stellen',
--   'Maak een weekplanning met duidelijke grenzen tussen werk en privé',
--   'hoog',
--   'medium',
--   'laag',
--   ARRAY[
--     'Deze actie lost direct je hoogste pijnpunt op: werkdruk en energiemanagement',
--     'Workshops geven je concrete tools om je tijd beter te beheren',
--     'Een weekplanning helpt je structuur aan te brengen en grenzen te stellen'
--   ],
--   'Deze 3 acties pakken je belangrijkste uitdagingen aan: werkdruk, tijdmanagement en werk-privébalans. Ze zijn praktisch uitvoerbaar en hebben directe impact op je welzijn.',
--   ARRAY['00000000-0000-0000-0000-000000000003'] -- vervang door echte gesprek UUIDs
-- );
