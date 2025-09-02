-- Nieuwe tabel voor thema evaluaties door werknemers
-- Deze tabel slaat de scores op die werknemers geven na het afronden van een gesprek

CREATE TABLE IF NOT EXISTS thema_evaluaties (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    werknemer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    gesprek_id UUID NOT NULL REFERENCES gesprek(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
    evaluatie_datum TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unieke constraint: één evaluatie per gesprek
    UNIQUE(gesprek_id)
);

-- Index voor snelle queries
CREATE INDEX IF NOT EXISTS idx_thema_evaluaties_werknemer_id ON thema_evaluaties(werknemer_id);
CREATE INDEX IF NOT EXISTS idx_thema_evaluaties_theme_id ON thema_evaluaties(theme_id);
CREATE INDEX IF NOT EXISTS idx_thema_evaluaties_gesprek_id ON thema_evaluaties(gesprek_id);
CREATE INDEX IF NOT EXISTS idx_thema_evaluaties_evaluatie_datum ON thema_evaluaties(evaluatie_datum);

-- RLS (Row Level Security) policies
ALTER TABLE thema_evaluaties ENABLE ROW LEVEL SECURITY;

-- Policy: Werknemers kunnen alleen hun eigen evaluaties zien
CREATE POLICY "Werknemers kunnen eigen evaluaties zien" ON thema_evaluaties
    FOR SELECT USING (auth.uid() = werknemer_id);

-- Policy: Werknemers kunnen alleen hun eigen evaluaties aanmaken
CREATE POLICY "Werknemers kunnen eigen evaluaties aanmaken" ON thema_evaluaties
    FOR INSERT WITH CHECK (auth.uid() = werknemer_id);

-- Policy: Werknemers kunnen hun eigen evaluaties niet wijzigen (alleen aanmaken)
CREATE POLICY "Werknemers kunnen eigen evaluaties niet wijzigen" ON thema_evaluaties
    FOR UPDATE USING (false);

-- Policy: Werknemers kunnen hun eigen evaluaties niet verwijderen
CREATE POLICY "Werknemers kunnen eigen evaluaties niet verwijderen" ON thema_evaluaties
    FOR DELETE USING (false);

-- Policy: Werkgevers kunnen evaluaties van hun werknemers zien (via service role)
-- Dit wordt gebruikt voor het superadmin dashboard
CREATE POLICY "Service role kan alle evaluaties zien" ON thema_evaluaties
    FOR ALL USING (auth.role() = 'service_role');

-- Comment toevoegen voor documentatie
COMMENT ON TABLE thema_evaluaties IS 'Bevat evaluatiescores die werknemers geven na het afronden van een gesprek over een thema';
COMMENT ON COLUMN thema_evaluaties.score IS 'Score van 1-10 die de werknemer geeft voor de relevantie van de vragen';
COMMENT ON COLUMN thema_evaluaties.evaluatie_datum IS 'Datum en tijd waarop de evaluatie is gegeven';
COMMENT ON COLUMN thema_evaluaties.gesprek_id IS 'Unieke referentie naar het specifieke gesprek dat is geëvalueerd';

-- Toevoegen van Toestemming_AVG kolom aan users tabel
ALTER TABLE users ADD COLUMN IF NOT EXISTS toestemming_avg BOOLEAN DEFAULT false;

-- Comment toevoegen voor documentatie
COMMENT ON COLUMN users.toestemming_avg IS 'Toestemming van werknemer voor verwerking van antwoorden door AI-systeem';