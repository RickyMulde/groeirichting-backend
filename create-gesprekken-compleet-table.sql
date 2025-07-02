-- Drop bestaande tabel als deze bestaat
DROP TABLE IF EXISTS antwoordpervraag CASCADE;

-- Maak nieuwe tabel voor complete gesprekken
CREATE TABLE gesprekken_compleet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    werknemer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    gesprek_id UUID NOT NULL REFERENCES gesprek(id) ON DELETE CASCADE,
    
    -- Complete gespreksgeschiedenis als JSON array
    gespreksgeschiedenis JSONB NOT NULL DEFAULT '[]',
    
    -- Metadata over het gesprek
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    gestart_op TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    beeindigd_op TIMESTAMP WITH TIME ZONE,
    
    -- Status en taal
    status TEXT DEFAULT 'actief',
    taalcode TEXT DEFAULT 'nl',
    
    -- Indexen voor performance
    CONSTRAINT valid_gespreksgeschiedenis CHECK (jsonb_typeof(gespreksgeschiedenis) = 'array'),
    CONSTRAINT valid_metadata CHECK (jsonb_typeof(metadata) = 'object')
);

-- Indexen voor snelle queries
CREATE INDEX idx_gesprekken_compleet_werknemer ON gesprekken_compleet(werknemer_id);
CREATE INDEX idx_gesprekken_compleet_theme ON gesprekken_compleet(theme_id);
CREATE INDEX idx_gesprekken_compleet_gesprek ON gesprekken_compleet(gesprek_id);
CREATE INDEX idx_gesprekken_compleet_status ON gesprekken_compleet(status);
CREATE INDEX idx_gesprekken_compleet_gestart_op ON gesprekken_compleet(gestart_op);

-- Index voor werkgever queries (via users tabel)
-- Let op: employer_id staat in users tabel, niet in gesprekken_compleet
-- Voor werkgever queries: JOIN users ON gesprekken_compleet.werknemer_id = users.id WHERE users.employer_id = 'xxx'
CREATE INDEX idx_users_employer ON users(employer_id);

-- GIN index voor JSON queries
CREATE INDEX idx_gesprekken_compleet_gespreksgeschiedenis ON gesprekken_compleet USING GIN (gespreksgeschiedenis);
CREATE INDEX idx_gesprekken_compleet_metadata ON gesprekken_compleet USING GIN (metadata);

-- Voorbeeld van hoe de gespreksgeschiedenis eruit ziet:
/*
[
  {
    "type": "vaste_vraag",
    "vraag_id": "uuid-van-theme-question",
    "vraag_tekst": "Wat is je grootste uitdaging op werk?",
    "antwoord": "Ik heb moeite met prioriteiten stellen",
    "timestamp": "2024-01-01T10:00:00Z",
    "volgorde": 1
  },
  {
    "type": "vervolgvraag",
    "hoort_bij_vraag_id": "uuid-van-bovenstaande-vraag",
    "vraag_tekst": "Kun je een concreet voorbeeld geven?",
    "antwoord": "Ja, ik begin vaak met kleine taken in plaats van belangrijke projecten",
    "timestamp": "2024-01-01T10:02:00Z",
    "volgorde": 2
  },
  {
    "type": "vervolgvraag", 
    "hoort_bij_vraag_id": "uuid-van-bovenstaande-vraag",
    "vraag_tekst": "Hoe voel je je daarover?",
    "antwoord": "Frustrerend, want ik weet dat ik beter kan",
    "timestamp": "2024-01-01T10:04:00Z",
    "volgorde": 3
  }
]
*/

-- Voorbeeld van metadata:
/*
{
  "aantal_vaste_vragen": 3,
  "aantal_vervolgvragen": 5,
  "totale_gesprekstijd_seconden": 930,
  "laatste_vraag_type": "vervolgvraag",
  "gesprek_afgerond": true
}
*/ 