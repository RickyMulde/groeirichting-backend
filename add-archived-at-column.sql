-- Voeg archived_at kolom toe aan teams tabel
ALTER TABLE teams ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;

-- Maak index voor performance
CREATE INDEX idx_teams_archived_at ON teams(archived_at);

-- Update bestaande teams (geen archived_at = niet gearchiveerd)
-- Dit is al de default, dus geen UPDATE nodig
