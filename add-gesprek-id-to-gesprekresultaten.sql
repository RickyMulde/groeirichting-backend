-- Voeg gesprek_id kolom toe aan gesprekresultaten tabel
-- Dit is nodig om meerdere gesprekken per thema te ondersteunen

ALTER TABLE gesprekresultaten 
ADD COLUMN gesprek_id UUID REFERENCES gesprek(id);

-- Maak een index voor betere performance
CREATE INDEX idx_gesprekresultaten_gesprek_id ON gesprekresultaten(gesprek_id);

-- Voeg een constraint toe om ervoor te zorgen dat gesprek_id uniek is per gesprek
-- (maar meerdere resultaten per thema/werknemer combinatie mogelijk)
ALTER TABLE gesprekresultaten 
ADD CONSTRAINT unique_gesprek_resultaat UNIQUE (gesprek_id);

-- Update het schema bestand
-- Voeg deze regel toe aan Backend/Constanten/supabase-schema.json:
-- {
--   "table_name": "gesprekresultaten",
--   "column_name": "gesprek_id", 
--   "data_type": "uuid"
-- } 