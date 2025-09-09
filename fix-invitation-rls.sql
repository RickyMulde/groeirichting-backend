-- Fix voor invitations RLS policy
-- Voer dit uit in Supabase SQL Editor

-- Verwijder bestaande policy
DROP POLICY IF EXISTS "Anonymous users can read invitations by token" ON invitations;

-- Voeg nieuwe policy toe (minder strikt)
CREATE POLICY "Anonymous users can read invitations by token" ON invitations
  FOR SELECT USING (
    token IS NOT NULL AND 
    status = 'pending'
  );
