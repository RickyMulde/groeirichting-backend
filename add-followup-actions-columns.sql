-- Voeg kolommen toe voor vervolgacties aan de gesprekresultaten tabel
ALTER TABLE gesprekresultaten 
ADD COLUMN IF NOT EXISTS vervolgacties JSONB,
ADD COLUMN IF NOT EXISTS vervolgacties_toelichting TEXT,
ADD COLUMN IF NOT EXISTS vervolgacties_generatie_datum TIMESTAMP WITH TIME ZONE;

-- Voeg comment toe voor documentatie
COMMENT ON COLUMN gesprekresultaten.vervolgacties IS 'Array van AI-gegenereerde vervolgacties in JSON formaat';
COMMENT ON COLUMN gesprekresultaten.vervolgacties_toelichting IS 'Toelichting bij de gegenereerde vervolgacties';
COMMENT ON COLUMN gesprekresultaten.vervolgacties_generatie_datum IS 'Datum en tijd waarop de vervolgacties zijn gegenereerd'; 