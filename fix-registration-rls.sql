-- Fix RLS policies voor registratie flow
-- Dit bestand moet worden uitgevoerd in Supabase SQL Editor

-- 1. Voeg policy toe voor employers INSERT tijdens registratie
-- Deze policy staat toe dat een gebruiker een employer kan aanmaken als ze net zijn geregistreerd
CREATE POLICY "Allow employer creation during registration" ON "public"."employers"
FOR INSERT
TO public
WITH CHECK (
  -- Toestaan als de gebruiker net is aangemaakt (binnen laatste 5 minuten)
  -- en er nog geen employer_id is in users tabel
  auth.uid() IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND employer_id IS NOT NULL
  )
);

-- 2. Voeg policy toe voor users INSERT tijdens registratie  
-- Deze policy staat toe dat een gebruiker zichzelf kan toevoegen aan users tabel
CREATE POLICY "Allow user self-insert during registration" ON "public"."users"
FOR INSERT
TO public
WITH CHECK (
  -- Toestaan als de gebruiker zichzelf toevoegt
  auth.uid() = id
  -- En de email overeenkomt met de geauthenticeerde gebruiker
  AND email = auth.jwt() ->> 'email'
);

-- 3. De bestaande "Users can update own data" policy dekt al users UPDATE
-- Geen extra policy nodig voor users UPDATE

-- 4. De bestaande "Employers can update own company" policy dekt al employers UPDATE
-- Geen extra policy nodig voor employers UPDATE
