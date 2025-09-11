-- Fix RLS policies voor registratie flow
-- Dit bestand moet worden uitgevoerd in Supabase SQL Editor

-- 1. Verwijder de oude restrictieve employers INSERT policy
DROP POLICY IF EXISTS "Employers can insert own company" ON "public"."employers";

-- 2. Voeg nieuwe employers INSERT policy toe die registratie toestaat
-- Verwijder eerst de bestaande policy als die er is
DROP POLICY IF EXISTS "Allow employer creation during registration" ON "public"."employers";

CREATE POLICY "Allow employer creation during registration" ON "public"."employers"
FOR INSERT
TO public
WITH CHECK (
  -- Toestaan als de gebruiker bestaat in auth
  auth.uid() IS NOT NULL 
  -- EN (ofwel de gebruiker is net geregistreerd EN heeft nog geen employer_id)
  -- OF (de gebruiker heeft al een employer_id en maakt een nieuwe aan - dit blokkeren we)
  AND (
    -- Scenario 1: Nieuwe registratie (gebruiker bestaat nog niet in users tabel)
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
    OR
    -- Scenario 2: Bestaande gebruiker zonder employer_id (zeldzaam maar mogelijk)
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND employer_id IS NULL
    )
  )
);

-- 3. Voeg policy toe voor users INSERT tijdens registratie  
-- Deze policy staat toe dat een gebruiker zichzelf kan toevoegen aan users tabel
-- Verwijder eerst de bestaande policy als die er is
DROP POLICY IF EXISTS "Allow user self-insert during registration" ON "public"."users";

CREATE POLICY "Allow user self-insert during registration" ON "public"."users"
FOR INSERT
TO public
WITH CHECK (
  -- Toestaan als de gebruiker zichzelf toevoegt
  auth.uid() = id
  -- En de email overeenkomt met de geauthenticeerde gebruiker
  AND email = auth.jwt() ->> 'email'
);

-- 4. De bestaande "Users can update own data" policy dekt al users UPDATE
-- De bestaande "Employers can update own company" policy dekt al employers UPDATE
