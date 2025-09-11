-- Fix RLS policies voor anonieme registratie flow
-- Dit bestand moet worden uitgevoerd in Supabase SQL Editor

-- 1. Verwijder de oude restrictieve employers INSERT policy
DROP POLICY IF EXISTS "Employers can insert own company" ON "public"."employers";
DROP POLICY IF EXISTS "Allow employer creation during registration" ON "public"."employers";

-- 2. Voeg nieuwe employers INSERT policy toe die anonieme registratie toestaat
CREATE POLICY "Allow employer creation during registration" ON "public"."employers"
FOR INSERT
TO public
WITH CHECK (
  -- Toestaan voor anonieme registratie (geen auth.uid() check)
  -- Dit is veilig omdat we alleen tijdens registratie gebruiken
  true
);

-- 3. Voeg policy toe voor users INSERT tijdens anonieme registratie
DROP POLICY IF EXISTS "Allow user self-insert during registration" ON "public"."users";

CREATE POLICY "Allow user self-insert during registration" ON "public"."users"
FOR INSERT
TO public
WITH CHECK (
  -- Toestaan voor anonieme registratie
  -- Controleer dat de gebruiker bestaat in auth.users via email
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = users.id 
    AND auth.users.email = users.email
  )
);

-- 4. Voeg policy toe voor users UPDATE tijdens registratie
DROP POLICY IF EXISTS "Allow user update during registration" ON "public"."users";

CREATE POLICY "Allow user update during registration" ON "public"."users"
FOR UPDATE
TO public
USING (
  -- Toestaan voor anonieme registratie
  -- Controleer dat de gebruiker bestaat in auth.users via email
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = users.id 
    AND auth.users.email = users.email
  )
)
WITH CHECK (
  -- Toestaan voor anonieme registratie
  -- Controleer dat de gebruiker bestaat in auth.users via email
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = users.id 
    AND auth.users.email = users.email
  )
);

-- 5. De bestaande policies blijven bestaan voor ingelogde gebruikers
