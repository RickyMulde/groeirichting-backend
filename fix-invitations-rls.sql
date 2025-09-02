-- =====================================================
-- FIX VOOR INVITATIONS RLS POLICY
-- =====================================================
-- 
-- Probleem: Anonieme gebruikers kunnen geen uitnodigingen lezen via token
-- Oplossing: Policy toevoegen voor token-based toegang
--
-- UITVOEREN IN SUPABASE SQL EDITOR
-- =====================================================

-- Verwijder bestaande policies eerst (als ze bestaan)
DROP POLICY IF EXISTS "Employers can view own invitations" ON invitations;
DROP POLICY IF EXISTS "Employers can update own invitations" ON invitations;
DROP POLICY IF EXISTS "Employers can insert own invitations" ON invitations;

-- Voeg nieuwe policies toe:

-- 1. Anonieme gebruikers kunnen uitnodigingen lezen via token
CREATE POLICY "Anonymous users can read invitations by token" ON invitations
  FOR SELECT USING (
    token IS NOT NULL AND 
    status = 'pending' AND 
    expires_at > NOW()
  );

-- 2. Werkgevers kunnen hun eigen uitnodigingen zien
CREATE POLICY "Employers can view own invitations" ON invitations
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = invitations.employer_id
    )
  );

-- 3. Werkgevers kunnen hun eigen uitnodigingen bewerken
CREATE POLICY "Employers can update own invitations" ON invitations
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = invitations.employer_id
    )
  );

-- 4. Werkgevers kunnen hun eigen uitnodigingen invoegen
CREATE POLICY "Employers can insert own invitations" ON invitations
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = invitations.employer_id
    )
  );
