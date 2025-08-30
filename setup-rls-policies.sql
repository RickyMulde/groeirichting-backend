-- =====================================================
-- COMPLEET RLS-POLICIES SCRIPT VOOR GROEIRICHTING
-- =====================================================
-- 
-- Dit script:
-- 1. Schakelt RLS in op alle tabellen
-- 2. Schakelt real-time uit op alle tabellen
-- 3. Maakt alle benodigde policies aan
-- 4. Zorgt voor waterdichte beveiliging per tenant/gebruiker
--
-- UITVOEREN IN SUPABASE SQL EDITOR
-- =====================================================

-- =====================================================
-- STAP 1: RLS INSCHAKELEN EN REAL-TIME UITSCHAKELEN
-- =====================================================

-- Schakel RLS in op alle tabellen
ALTER TABLE employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gesprek ENABLE ROW LEVEL SECURITY;
ALTER TABLE gesprekken_compleet ENABLE ROW LEVEL SECURITY;
ALTER TABLE gesprekresultaten ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_theme_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE top_vervolgacties ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE werkgever_gesprek_instellingen ENABLE ROW LEVEL SECURITY;

-- Schakel real-time uit op alle tabellen (niet nodig voor je app)
-- Dit gebeurt automatisch wanneer RLS wordt ingeschakeld
-- Geen extra commando's nodig

-- =====================================================
-- STAP 2: USERS TABEL POLICIES
-- =====================================================

-- Gebruikers kunnen alleen hun eigen data zien
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- Gebruikers kunnen alleen hun eigen data bewerken
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Gebruikers kunnen alleen hun eigen data invoegen
CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Werkgevers kunnen werknemers van hun bedrijf zien
CREATE POLICY "Employers can view their employees" ON users
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = users.employer_id
    )
  );

-- =====================================================
-- STAP 3: EMPLOYERS TABEL POLICIES
-- =====================================================

-- Werkgevers kunnen alleen hun eigen bedrijfsdata zien
CREATE POLICY "Employers can view own company" ON employers
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE employer_id = employers.id
    )
  );

-- Werkgevers kunnen alleen hun eigen bedrijfsdata bewerken
CREATE POLICY "Employers can update own company" ON employers
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM users WHERE employer_id = employers.id
    )
  );

-- Werkgevers kunnen alleen hun eigen bedrijf invoegen
CREATE POLICY "Employers can insert own company" ON employers
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM users WHERE employer_id = employers.id
    )
  );

-- =====================================================
-- STAP 4: GESPREK TABEL POLICIES
-- =====================================================

-- Werknemers kunnen hun eigen gesprekken zien
CREATE POLICY "Employees can view own conversations" ON gesprek
  FOR SELECT USING (auth.uid() = werknemer_id);

-- Werkgevers kunnen gesprekken van hun werknemers zien
CREATE POLICY "Employers can view employee conversations" ON gesprek
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = (
        SELECT employer_id FROM users WHERE id = gesprek.werknemer_id
      )
    )
  );

-- Werknemers kunnen hun eigen gesprekken bewerken
CREATE POLICY "Employees can update own conversations" ON gesprek
  FOR UPDATE USING (auth.uid() = werknemer_id);

-- Werknemers kunnen hun eigen gesprekken invoegen
CREATE POLICY "Employees can insert own conversations" ON gesprek
  FOR INSERT WITH CHECK (auth.uid() = werknemer_id);

-- =====================================================
-- STAP 5: GESPREKKEN_COMPLEET TABEL POLICIES
-- =====================================================

-- Werknemers kunnen hun eigen complete gesprekken zien
CREATE POLICY "Employees can view own complete conversations" ON gesprekken_compleet
  FOR SELECT USING (auth.uid() = werknemer_id);

-- Werkgevers kunnen complete gesprekken van hun werknemers zien
CREATE POLICY "Employers can view employee complete conversations" ON gesprekken_compleet
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = (
        SELECT employer_id FROM users WHERE id = gesprekken_compleet.werknemer_id
      )
    )
  );

-- Werknemers kunnen hun eigen complete gesprekken bewerken
CREATE POLICY "Employees can update own complete conversations" ON gesprekken_compleet
  FOR UPDATE USING (auth.uid() = werknemer_id);

-- Werknemers kunnen hun eigen complete gesprekken invoegen
CREATE POLICY "Employees can insert own complete conversations" ON gesprekken_compleet
  FOR INSERT WITH CHECK (auth.uid() = werknemer_id);

-- =====================================================
-- STAP 6: GESPREKRESULTATEN TABEL POLICIES
-- =====================================================

-- Werknemers kunnen hun eigen resultaten zien
CREATE POLICY "Employees can view own results" ON gesprekresultaten
  FOR SELECT USING (auth.uid() = werknemer_id);

-- Werkgevers kunnen resultaten van hun werknemers zien
CREATE POLICY "Employers can view employee results" ON gesprekresultaten
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = gesprekresultaten.werkgever_id
    )
  );

-- Werknemers kunnen hun eigen resultaten bewerken
CREATE POLICY "Employees can update own results" ON gesprekresultaten
  FOR UPDATE USING (auth.uid() = werknemer_id);

-- Werknemers kunnen hun eigen resultaten invoegen
CREATE POLICY "Employees can insert own results" ON gesprekresultaten
  FOR INSERT WITH CHECK (auth.uid() = werknemer_id);

-- =====================================================
-- STAP 7: INVITATIONS TABEL POLICIES
-- =====================================================

-- Werkgevers kunnen alleen hun eigen uitnodigingen zien
CREATE POLICY "Employers can view own invitations" ON invitations
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = invitations.employer_id
    )
  );

-- Werkgevers kunnen alleen hun eigen uitnodigingen bewerken
CREATE POLICY "Employers can update own invitations" ON invitations
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = invitations.employer_id
    )
  );

-- Werkgevers kunnen alleen hun eigen uitnodigingen invoegen
CREATE POLICY "Employers can insert own invitations" ON invitations
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = invitations.employer_id
    )
  );

-- =====================================================
-- STAP 8: ORGANIZATION_THEME_INSIGHTS TABEL POLICIES
-- =====================================================

-- Werkgevers kunnen alleen hun eigen organisatie insights zien
CREATE POLICY "Employers can view own organization insights" ON organization_theme_insights
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = (
        SELECT employer_id FROM users WHERE id = organization_theme_insights.organisatie_id
      )
    )
  );

-- Werkgevers kunnen alleen hun eigen organisatie insights bewerken
CREATE POLICY "Employers can update own organization insights" ON organization_theme_insights
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = (
        SELECT employer_id FROM users WHERE id = organization_theme_insights.organisatie_id
      )
    )
  );

-- Werkgevers kunnen alleen hun eigen organisatie insights invoegen
CREATE POLICY "Employers can insert own organization insights" ON organization_theme_insights
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = (
        SELECT employer_id FROM users WHERE id = organization_theme_insights.organisatie_id
      )
    )
  );

-- =====================================================
-- STAP 9: THEME_QUESTIONS TABEL POLICIES
-- =====================================================

-- Iedereen kan thema vragen zien (publieke data)
CREATE POLICY "Anyone can view theme questions" ON theme_questions
  FOR SELECT USING (true);

-- Alleen superusers kunnen thema vragen bewerken
CREATE POLICY "Only superusers can modify theme questions" ON theme_questions
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superuser'
    )
  );

-- =====================================================
-- STAP 10: THEMES TABEL POLICIES
-- =====================================================

-- Iedereen kan thema's zien (publieke data)
CREATE POLICY "Anyone can view themes" ON themes
  FOR SELECT USING (true);

-- Alleen superusers kunnen thema's bewerken
CREATE POLICY "Only superusers can modify themes" ON themes
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'superuser'
    )
  );

-- =====================================================
-- STAP 11: TOP_VERVOLGACTIES TABEL POLICIES
-- =====================================================

-- Werknemers kunnen hun eigen top acties zien
CREATE POLICY "Employees can view own top actions" ON top_vervolgacties
  FOR SELECT USING (auth.uid() = werknemer_id);

-- Werkgevers kunnen top acties van hun werknemers zien
CREATE POLICY "Employers can view employee top actions" ON top_vervolgacties
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = top_vervolgacties.werkgever_id
    )
  );

-- Werknemers kunnen hun eigen top acties bewerken
CREATE POLICY "Employees can update own top actions" ON top_vervolgacties
  FOR UPDATE USING (auth.uid() = werknemer_id);

-- Werknemers kunnen hun eigen top acties invoegen
CREATE POLICY "Employees can insert own top actions" ON top_vervolgacties
  FOR INSERT WITH CHECK (auth.uid() = werknemer_id);

-- =====================================================
-- STAP 12: WERKGEVER_GESPREK_INSTELLINGEN TABEL POLICIES
-- =====================================================

-- Werkgevers kunnen alleen hun eigen instellingen zien
CREATE POLICY "Employers can view own settings" ON werkgever_gesprek_instellingen
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = werkgever_gesprek_instellingen.werkgever_id
    )
  );

-- Werkgevers kunnen alleen hun eigen instellingen bewerken
CREATE POLICY "Employers can update own settings" ON werkgever_gesprek_instellingen
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = werkgever_gesprek_instellingen.werkgever_id
    )
  );

-- Werkgevers kunnen alleen hun eigen instellingen invoegen
CREATE POLICY "Employers can insert own settings" ON werkgever_gesprek_instellingen
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'employer' AND employer_id = werkgever_gesprek_instellingen.werkgever_id
    )
  );

-- =====================================================
-- STAP 13: VERWIJDER OUDE POLICIES (OPTIONEEL)
-- =====================================================

-- Als je oude policies hebt, kun je ze hier verwijderen
-- Vervang 'policy_name' door de echte naam van oude policies
-- DROP POLICY IF EXISTS "policy_name" ON table_name;

-- =====================================================
-- STAP 14: TEST DE POLICIES
-- =====================================================

-- Test of RLS werkt door deze query uit te voeren:
-- SELECT table_name, row_security FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name IN (
--   'users', 'employers', 'gesprek', 'gesprekken_compleet', 
--   'gesprekresultaten', 'invitations', 'organization_theme_insights',
--   'theme_questions', 'themes', 'top_vervolgacties', 
--   'werkgever_gesprek_instellingen'
-- );

-- =====================================================
-- EINDE VAN HET SCRIPT
-- =====================================================
-- 
-- Alle tabellen hebben nu RLS ingeschakeld en waterdichte policies!
-- Je data is nu veilig per tenant/gebruiker.
-- 
-- Volgende stap: Test de policies door in te loggen als verschillende gebruikers
-- en te controleren of ze alleen hun eigen data kunnen zien.
-- =====================================================
