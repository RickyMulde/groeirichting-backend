const express = require('express')
const { createClient } = require('@supabase/supabase-js')
// 🔄 MIGRATIE: Nu met Responses API voor GPT-5.2
const openaiClient = require('./utils/openaiClient')
const { authMiddleware, assertTeamInOrg } = require('./middleware/auth')
const { hasThemeAccess } = require('./utils/themeAccessService')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gebruik auth middleware voor alle routes
router.use(authMiddleware)

// POST /api/generate-organisation-summary
// Genereert een nieuwe organisatie samenvatting en adviezen (team-specifiek of organisatie-breed)
router.post('/', async (req, res) => {
  const { organisatie_id, theme_id, team_id } = req.body
  const { employerId, isTeamleider, teamleiderVanTeamId, role } = req.ctx

  // Valideer dat organisatie_id overeenkomt met employerId uit context
  if (organisatie_id !== employerId) {
    return res.status(403).json({ error: 'Geen toegang tot deze organisatie' })
  }

  if (!organisatie_id || !theme_id) {
    return res.status(400).json({ error: 'Organisatie ID en Thema ID zijn verplicht' })
  }

  // Voor teamleiders: gebruik automatisch hun team
  let effectiveTeamId = team_id
  if (isTeamleider) {
    effectiveTeamId = teamleiderVanTeamId
    if (!effectiveTeamId) {
      return res.status(400).json({ error: 'Geen team gekoppeld aan deze teamleider' })
    }
    console.log('🔍 Teamleider toegang - automatisch team filter:', effectiveTeamId)
  } else if (role === 'employer') {
    // Werkgevers: valideer team_id als opgegeven
    if (team_id) {
      await assertTeamInOrg(team_id, employerId)
    }
    effectiveTeamId = team_id
  } else {
    return res.status(403).json({ error: 'Alleen werkgevers en teamleiders hebben toegang tot deze endpoint' })
  }

  // ✅ VALIDATIE: Check toegang tot thema
  const hasAccess = await hasThemeAccess(employerId, theme_id, effectiveTeamId || null)
  if (!hasAccess) {
    return res.status(403).json({ 
      error: 'Dit thema is niet beschikbaar voor jouw organisatie of team' 
    })
  }

  try {
    // 1. Haal werknemers op (team-specifiek of organisatie-breed)
    let employeesQuery = supabase
      .from('users')
      .select('id')
      .eq('employer_id', employerId)  // Gebruik employerId uit context
      .eq('role', 'employee')

    // Filter op team_id als opgegeven
    if (effectiveTeamId) {
      employeesQuery = employeesQuery.eq('team_id', effectiveTeamId)
    }

    const { data: employees, error: employeesError } = await employeesQuery

    if (employeesError) throw employeesError

    if (!employees || employees.length < 4) {
      return res.status(400).json({ 
        error: 'Minimaal 4 medewerkers moeten het thema hebben afgerond voordat een samenvatting kan worden gegenereerd' 
      })
    }

    // 2. Haal gesprekresultaten op voor deze werknemers (met samenvatting en adviezen)
    const employeeIds = employees.map(emp => emp.id)
    const { data: results, error: resultsError } = await supabase
      .from('gesprekresultaten')
      .select('score, werknemer_id, samenvatting, vervolgacties')
      .eq('werkgever_id', employerId)  // Gebruik employerId uit context
      .eq('theme_id', theme_id)
      .in('werknemer_id', employeeIds)
      .not('samenvatting', 'is', null) // Alleen resultaten met samenvatting

    if (resultsError) throw resultsError

    if (!results || results.length < 4) {
      return res.status(400).json({ 
        error: 'Minimaal 4 medewerkers moeten het thema hebben afgerond voordat een samenvatting kan worden gegenereerd' 
      })
    }

    // 3. Bereken gemiddelde score (nodig voor scenario bepaling in prompt)
    const scores = results.map(r => r.score).filter(score => score !== null)
    const avgScore = scores.length > 0 ? 
      Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null

    if (!avgScore) {
      return res.status(400).json({ 
        error: 'Geen scores beschikbaar om samenvatting te genereren' 
      })
    }

    // 4. Haal thema informatie op
    const { data: theme, error: themeError } = await supabase
      .from('themes')
      .select('*')
      .eq('id', theme_id)
      .single()

    if (themeError) throw themeError

    // 4b. Haal werkgever configuratie op voor organisatie-omschrijving
    const { data: werkgeverConfig, error: configError } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('organisatie_omschrijving')
      .eq('werkgever_id', employerId)  // Gebruik employerId uit context
      .single()

    if (configError && configError.code !== 'PGRST116') {
      console.warn('Kon werkgever configuratie niet ophalen:', configError)
    }

    // 5. Haal team informatie op als team_id is opgegeven
    let teamInfo = null
    if (effectiveTeamId) {
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('naam, teams_beschrijving')
        .eq('id', effectiveTeamId)
        .eq('werkgever_id', employerId)
        .single()
      
      if (!teamError && team) {
        teamInfo = team
      }
    }

    // 6. Structureer data: bundel samenvattingen en adviezen per medewerker
    const employeeData = results.map(result => ({
      werknemer_id: result.werknemer_id,
      score: result.score,
      samenvatting: result.samenvatting || '',
      adviezen: result.vervolgacties || [] // Array van adviezen met categorie, titel, reden, resultaat
    }))

    // 6b. Analyseer scores op outliers en alarm-signalen
    const validScores = employeeData.map(emp => emp.score).filter(score => score !== null && score !== undefined)
    const lageScores = validScores.filter(score => score < 4.0) // CRISIS scores (< 4.0)
    const zeerLageScores = validScores.filter(score => score < 3.0) // Zeer ernstige scores
    const problematischeScores = validScores.filter(score => score < 5.0) // Voor 20% check (< 5.0)
    const hogeScores = validScores.filter(score => score >= 7.0) // BORGEN scores
    
    // Bepaal of er alarm-signalen zijn
    const heeftAlarmSignalen = lageScores.length > 0 || zeerLageScores.length > 0
    const alarmRatio = validScores.length > 0 ? (lageScores.length / validScores.length) : 0
    const problematischeRatio = validScores.length > 0 ? (problematischeScores.length / validScores.length) : 0
    
    // Identificeer medewerkers met lage scores voor context
    const medewerkersMetLageScore = employeeData
      .filter(emp => emp.score !== null && emp.score !== undefined && emp.score < 4.0)
      .map(emp => ({
        score: emp.score,
        samenvatting: emp.samenvatting
      }))

    // 7. Bouw prompt input: samenvattingen en adviezen
    // Voeg score context toe aan samenvattingen voor betere analyse
    const samenvattingenTekst = employeeData
      .map((emp, index) => {
        const scoreInfo = emp.score !== null && emp.score !== undefined 
          ? ` (Score: ${emp.score}/10)` 
          : ' (Geen score)'
        return `[Medewerker ${index + 1}${scoreInfo}]: ${emp.samenvatting}`
      })
      .join('\n\n')
    
    // Bouw alarm-sectie als er lage scores zijn
    const alarmSectie = heeftAlarmSignalen ? `
⚠️ ALARM-SIGNALEN:
- ${lageScores.length} medewerker(s) heeft/hebben een score < 4.0 (CRISIS niveau)
${zeerLageScores.length > 0 ? `- ${zeerLageScores.length} medewerker(s) heeft/hebben een score < 3.0 (ZEER ERNSTIG)` : ''}
- Dit is ${(alarmRatio * 100).toFixed(0)}% van het team
- Gemiddelde score: ${avgScore} (maar let op: er zijn negatieve uitschieters!)

MEDEWERKERS MET LAGE SCORES:
${medewerkersMetLageScore.map((emp, idx) => 
  `Medewerker met score ${emp.score}/10:\n${emp.samenvatting}`
).join('\n\n---\n\n')}

BELANGRIJK: Zelfs als het gemiddelde hoog is (>= 7.0), moet je deze alarm-signalen serieus nemen!
` : ''

    // Groepeer adviezen om patronen zichtbaar te maken
    const alleAdviezen = employeeData.flatMap(emp => 
      (emp.adviezen || []).map(advies => ({
        ...advies,
        werknemer_id: emp.werknemer_id
      }))
    )
    

    // Formatteer adviezen: groepeer per categorie en toon alle adviezen (niet alleen unieke titels)
    // Dit helpt GPT om semantische patronen te herkennen
    const adviezenPerCategorie = {
      'Oplossing': [],
      'Persoon': [],
      'Verbinding': []
    }
    
    alleAdviezen.forEach(advies => {
      const categorie = advies.categorie || 'Onbekend'
      if (adviezenPerCategorie[categorie]) {
        adviezenPerCategorie[categorie].push(advies)
      }
    })

    // Formatteer adviezen per categorie met alle details
    const adviezenTekst = Object.entries(adviezenPerCategorie)
      .filter(([categorie, adviezen]) => adviezen.length > 0)
      .map(([categorie, adviezen]) => {
        const frequentieInfo = adviezen.length > 1 
          ? ` (${adviezen.length} medewerkers kregen adviezen in deze categorie)` 
          : ` (1 medewerker kreeg een advies in deze categorie)`
        
        const adviezenLijst = adviezen.map((advies, idx) => {
          return `  ${idx + 1}. Titel: ${advies.titel || 'Geen titel'}
     Reden: ${advies.reden || 'Geen reden'}
     Resultaat: ${advies.resultaat || 'Geen resultaat'}`
        }).join('\n\n')
        
        return `CATEGORIE: ${categorie}${frequentieInfo}
${adviezenLijst}`
      })
      .join('\n\n---\n\n')

    const teamContext = teamInfo ? 
      `\n\nTeam context: ${teamInfo.naam}${teamInfo.teams_beschrijving ? ` - ${teamInfo.teams_beschrijving}` : ''}\nAantal teamleden: ${employees.length}` : 
      `\n\nOrganisatie context: ${employees.length} medewerkers`

    // Bepaal context-terminologie (team vs organisatie)
    const contextTerm = teamInfo ? 'team' : 'organisatie'
    const contextTermPlural = teamInfo ? 'teamleden' : 'medewerkers'
    const contextTermData = teamInfo ? 'teamdata' : 'organisatiedata'

    // System instructions - Nieuwe structuur met Leiderschaps-Driehoek
    const systemInstructions = `
ROL: Je bent een Senior Organisatie-Psycholoog en Data-Analist.

CONTEXT:
Je ontvangt geaggregeerde data van een ${contextTerm} (scores, samenvattingen, ontvangen adviezen).
Thema Score: ${avgScore} (Schaal 1-10).

OPDRACHT:
Analyseer de data en genereer een dashboard-output voor de MANAGER.

BELANGRIJK: Je rol is om PATRONEN te observeren en te signaleren vanuit de data, niet om directe acties voor te schrijven. De manager bepaalt zelf welke acties nodig zijn op basis van jouw observaties. Formuleer daarom observaties, geen commando's.

---

STAP 1: BEPAAL HET SCENARIO (Op basis van score + alarm-signalen)
${heeftAlarmSignalen ? `
⚠️ ALARM-CHECK: Er zijn medewerkers met lage scores (< 4.0) gedetecteerd!
Zelfs als het gemiddelde hoog is, moet je deze signalen serieus nemen.

SCENARIO BEPALING:
1. EERST: Check of er alarm-signalen zijn (lage scores, negatieve samenvattingen)
2. DAN: Bepaal scenario op basis van:
   - Als er alarm-signalen zijn: Kies CRISIS of VERBETEREN (afhankelijk van ernst)
   - Als geen alarm-signalen: Gebruik gemiddelde score:
     * Score < 4.0 (CRISIS): Toon is urgent, feitelijk en waarschuwend. Focus op risico-beperking.
     * Score 4.0 - 6.9 (VERBETEREN): Toon is constructief en analyserend. Focus op oplossen van knelpunten.
     * Score >= 7.0 (BORGEN): Toon is enthousiast en waarderend. Focus op vasthouden en excelleren.

BELANGRIJK: Een hoog gemiddelde (>= 7.0) met lage uitschieters betekent NIET automatisch BORGEN!
Als 20% of meer van de ${contextTermPlural} een score < 5.0 heeft (${problematischeScores.length} van ${validScores.length} = ${(problematischeRatio * 100).toFixed(0)}%), kies dan VERBETEREN of CRISIS.
` : `
Kijk naar de gemiddelde score (${avgScore}) en kies je 'Tone of Voice':
- Score < 4.0 (CRISIS): Toon is urgent, feitelijk en waarschuwend. Focus op risico-beperking.
- Score 4.0 - 6.9 (VERBETEREN): Toon is constructief en analyserend. Focus op oplossen van knelpunten.
- Score >= 7.0 (BORGEN): Toon is enthousiast en waarderend. Focus op vasthouden en excelleren.
`}

---

STAP 2: DE SAMENVATTING
Schrijf een samenvatting (max 80 woorden) in de toon van het gekozen scenario.
${heeftAlarmSignalen ? `
⚠️ ALARM-PRIORITEIT: Als er alarm-signalen zijn, moet je deze BENOEMEN in de samenvatting!
- Start met het alarm-signaal en WEES KWANTITATIEF:
  ❌ NIET: "Er zijn enkele ${contextTermPlural} die ernstige knelpunten ervaren..."
  ✅ WEL: "Een aanzienlijk deel van de ${contextTermPlural} (${(alarmRatio * 100).toFixed(0)}%) ervaart ernstige knelpunten..."
- Benoem wat goed gaat EN wat niet (ook als het gemiddelde hoog is)
- Onderbouw met KWANTITATIEVE patronen:
  ✅ WEL: "Een groot deel van de ${contextTermPlural} met scores onder de 4.0..." of "Meer dan ${(alarmRatio * 100).toFixed(0)}% van de ${contextTermPlural}..."
- Veralgemeen en anonimiseer: vermijd specifieke verwijzingen naar individuele medewerkers of functies
- Maar gebruik wel concrete aantallen en percentages waar mogelijk
- Maak duidelijk dat er aandacht nodig is voor degenen die het moeilijk hebben
` : `
- Benoem wat goed gaat en wat niet.
- Onderbouw met KWANTITATIEVE patronen uit de input:
  ❌ NIET: "Veel ${contextTermPlural} noemen..." of "Sommige ${contextTermPlural}..."
  ✅ WEL: Gebruik relatieve termen zoals "een groot deel", "meerderheid", "aanzienlijk deel" (bijv. "Een groot deel van de ${contextTermPlural} noemt..." of "Meer dan de helft van de ${contextTermPlural}..." of "Een aanzienlijk deel van de samenvattingen wijst op...")
- Veralgemeen en anonimiseer: vermijd specifieke verwijzingen naar individuele medewerkers of functies.
- Maar gebruik wel concrete aantallen en percentages waar mogelijk.
`}

---

STAP 3: DE 3 LEIDERSCHAPS-KAARTEN
Genereer precies 3 kaarten volgens de 'Leiderschaps-Driehoek'.
Zorg dat de inhoud past bij het scenario uit Stap 1.

KAART 1: SYSTEEM (De Organisatie)
- Focus: Processen, tools, bezetting, kaders.
- Titel: Observatiegericht & Strategisch (Max 6 woorden). Beschrijft het geobserveerde patroon/thema, niet een actie.
- Signaal: Dit is een OBSERVATIE, geen actie-advies. Beschrijf wat je ziet in de data. WEES KWANTITATIEF MAAR GEBRUIK RELATIEVE TERMEN!
  ❌ NIET: Directe acties zoals "Vernieuw jullie CRM systeem" of "Implementeer een nieuwe tool" of "Medewerkers geven aan dat..." of specifieke kleine aantallen zoals "1 van de 20"
  ✅ WEL: Observaties met relatieve kwantitatieve termen zoals "Het lijkt dat er knelpunten zitten in de gebruikte systemen" of "Er zijn signalen dat de huidige processen niet optimaal werken" of "Een groot deel van de adviezen in de categorie Oplossing wijst op behoefte aan..."
  Formuleer als: "Het lijkt dat...", "Er zijn signalen dat...", "De data wijst op...", "Er lijkt een patroon te zijn waarbij..."
  Refereer aan patronen uit de data, maar gebruik relatieve termen in plaats van exacte aantallen. Geen vage uitspraken, maar ook geen specifieke kleine aantallen.
- CTA: Pakkende, triggerende zin (max 12 woorden) die de manager aanzet om te klikken en de details te bekijken. Dit is een strategische oplossingsrichting die de te varen koers samenvat. Geen kleine afvinktaak, maar een uitnodigende actie die nieuwsgierigheid wekt.
  Voorbeelden: "Ontdek hoe je de werkdruk structureel verlaagt", "Bekijk het plan voor betere teamcommunicatie", "Leer hoe je de planning optimaliseert".
  ❌ NIET: "Bekijk onze checklist" of "Lees meer" (te generiek)
  ✅ WEL: "Ontdek de 3 stappen naar betere structuur" of "Bekijk hoe je teamcommunicatie verbetert"
- MICRO-ADVIEZEN: Genereer precies 3 eenvoudige, direct uitvoerbare micro-adviezen die DIRECT AANSLUITEN op de CTA hierboven. De micro-adviezen zijn concrete stappen die de manager kan zetten om de strategische richting uit de CTA te realiseren.
  BELANGRIJK: De micro-adviezen moeten logisch voortvloeien uit de CTA. Als de CTA gaat over "systemen optimaliseren", dan moeten de micro-adviezen concrete stappen zijn om systemen te optimaliseren (bijv. "Inventariseer systeemknelpunten", "Evalueer alternatieve tools", "Plan verbeteringstraject").
  Elke micro-advies bestaat uit:
  - Een korte, actiegerichte titel (max 8 woorden) die direct duidelijk maakt wat te doen
  - Een korte toelichting in kleine letters die uitlegt waarom of hoe (max 15 woorden)
  Voorbeelden (bij CTA "Ontdek hoe je de werkdruk structureel verlaagt"):
  * "Analyseer werkbelasting per teamlid" (toelichting: "Identificeer waar de druk het hoogst is")
  * "Herzie prioritering van taken" (toelichting: "Focus op wat echt belangrijk is")
  * "Plan capaciteitsbuffer in" (toelichting: "Houd ruimte voor onverwachte taken")
  ❌ NIET: Vage adviezen zoals "Verbeter de communicatie" of "Wees proactief" of micro-adviezen die niet aansluiten op de CTA
  ✅ WEL: Concrete, uitvoerbare acties die direct voortvloeien uit de CTA en het doel van deze kaart behalen

KAART 2: LEIDERSCHAP (Het Gedrag)
- Focus: Aansturing, communicatie, aandacht.
- Titel: Observatiegericht & Strategisch. Beschrijft het geobserveerde patroon/thema, niet een actie.
- Signaal: Dit is een OBSERVATIE, geen actie-advies. Beschrijf wat je ziet in de data. WEES KWANTITATIEF MAAR GEBRUIK RELATIEVE TERMEN!
  ❌ NIET: Directe acties zoals "Geef meer feedback" of "Plan meer gesprekken" of "Medewerkers ervaren..." of specifieke kleine aantallen zoals "1 van de 20"
  ✅ WEL: Observaties met relatieve kwantitatieve termen zoals "Het lijkt dat er behoefte is aan meer communicatie" of "Er zijn signalen dat de aansturing niet optimaal verloopt" of "Een groot deel van de adviezen in de categorie Persoon gaat over behoefte aan..."
  Formuleer als: "Het lijkt dat...", "Er zijn signalen dat...", "De data wijst op...", "Er lijkt een patroon te zijn waarbij..."
  Refereer aan patronen uit de adviezen, maar gebruik relatieve termen in plaats van exacte aantallen. Geen vage uitspraken, maar ook geen specifieke kleine aantallen.
- CTA: Pakkende, triggerende zin (max 12 woorden) die de manager aanzet om te klikken en de details te bekijken. Dit is een strategische oplossingsrichting die de te varen koers samenvat. Geen kleine afvinktaak, maar een uitnodigende actie die nieuwsgierigheid wekt.
  Voorbeelden: "Ontdek hoe je de werkdruk structureel verlaagt", "Bekijk het plan voor betere teamcommunicatie", "Leer hoe je de planning optimaliseert".
  ❌ NIET: "Bekijk onze checklist" of "Lees meer" (te generiek)
  ✅ WEL: "Ontdek de 3 stappen naar betere structuur" of "Bekijk hoe je teamcommunicatie verbetert"
- MICRO-ADVIEZEN: Genereer precies 3 eenvoudige, direct uitvoerbare micro-adviezen die DIRECT AANSLUITEN op de CTA hierboven. De micro-adviezen zijn concrete stappen die de manager kan zetten om de strategische richting uit de CTA te realiseren.
  BELANGRIJK: De micro-adviezen moeten logisch voortvloeien uit de CTA. Als de CTA gaat over "betere teamcommunicatie", dan moeten de micro-adviezen concrete stappen zijn om communicatie te verbeteren (bijv. "Plan wekelijkse 1-op-1 gesprekken", "Stel feedbackmomenten in", "Creëer communicatiekaders").
  Elke micro-advies bestaat uit:
  - Een korte, actiegerichte titel (max 8 woorden) die direct duidelijk maakt wat te doen
  - Een korte toelichting in kleine letters die uitlegt waarom of hoe (max 15 woorden)
  Voorbeelden (bij CTA "Bekijk het plan voor betere teamcommunicatie"):
  * "Plan wekelijkse 1-op-1 gesprekken" (toelichting: "Geeft ruimte voor persoonlijke aandacht en feedback")
  * "Stel feedbackmomenten in" (toelichting: "Creëer structurele momenten voor open communicatie")
  * "Definieer communicatiekaders" (toelichting: "Maak duidelijk hoe en wanneer te communiceren")
  ❌ NIET: Vage adviezen zoals "Verbeter de communicatie" of "Wees proactief" of micro-adviezen die niet aansluiten op de CTA
  ✅ WEL: Concrete, uitvoerbare acties die direct voortvloeien uit de CTA en het doel van deze kaart behalen

KAART 3: CULTUUR (Het Team)
- Focus: Sfeer, samenwerking, veiligheid.
- Titel: Observatiegericht & Strategisch. Beschrijft het geobserveerde patroon/thema, niet een actie.
- Signaal: Dit is een OBSERVATIE, geen actie-advies. Beschrijf wat je ziet in de data. WEES KWANTITATIEF MAAR GEBRUIK RELATIEVE TERMEN!
  ❌ NIET: Directe acties zoals "Organiseer meer teambuilding" of "Verbeter de sfeer" of "In de groep heerst..." of specifieke kleine aantallen zoals "1 van de 20"
  ✅ WEL: Observaties met relatieve kwantitatieve termen zoals "Het lijkt dat er uitdagingen zijn in de samenwerking" of "Er zijn signalen dat de teamdynamiek aandacht nodig heeft" of "Een groot deel van de adviezen in de categorie Verbinding wijst op behoefte aan..."
  Formuleer als: "Het lijkt dat...", "Er zijn signalen dat...", "De data wijst op...", "Er lijkt een patroon te zijn waarbij..."
  Refereer aan patronen uit de data, maar gebruik relatieve termen in plaats van exacte aantallen. Geen vage uitspraken, maar ook geen specifieke kleine aantallen.
- CTA: Pakkende, triggerende zin (max 12 woorden) die de manager aanzet om te klikken en de details te bekijken. Dit is een strategische oplossingsrichting die de te varen koers samenvat. Geen kleine afvinktaak, maar een uitnodigende actie die nieuwsgierigheid wekt.
  Voorbeelden: "Ontdek hoe je de werkdruk structureel verlaagt", "Bekijk het plan voor betere teamcommunicatie", "Leer hoe je de planning optimaliseert".
  ❌ NIET: "Bekijk onze checklist" of "Lees meer" (te generiek)
  ✅ WEL: "Ontdek de 3 stappen naar betere structuur" of "Bekijk hoe je teamcommunicatie verbetert"
- MICRO-ADVIEZEN: Genereer precies 3 eenvoudige, direct uitvoerbare micro-adviezen die DIRECT AANSLUITEN op de CTA hierboven. De micro-adviezen zijn concrete stappen die de manager kan zetten om de strategische richting uit de CTA te realiseren.
  BELANGRIJK: De micro-adviezen moeten logisch voortvloeien uit de CTA. Als de CTA gaat over "teamdynamiek versterken", dan moeten de micro-adviezen concrete stappen zijn om de teamdynamiek te versterken (bijv. "Organiseer maandelijkse teamuitjes", "Creëer veilige feedbackcultuur", "Vier successen samen").
  Elke micro-advies bestaat uit:
  - Een korte, actiegerichte titel (max 8 woorden) die direct duidelijk maakt wat te doen
  - Een korte toelichting in kleine letters die uitlegt waarom of hoe (max 15 woorden)
  Voorbeelden (bij CTA "Leer hoe je teamdynamiek versterkt"):
  * "Organiseer maandelijkse teamuitjes" (toelichting: "Versterkt de onderlinge banden en verbetert de sfeer")
  * "Creëer een veilige feedbackcultuur" (toelichting: "Moedig open communicatie aan zonder oordeel")
  * "Vier successen en leer van fouten" (toelichting: "Bevordert een positieve en lerende omgeving")
  ❌ NIET: Vage adviezen zoals "Verbeter de communicatie" of "Wees proactief" of micro-adviezen die niet aansluiten op de CTA
  ✅ WEL: Concrete, uitvoerbare acties die direct voortvloeien uit de CTA en het doel van deze kaart behalen

---

OUTPUT FORMAAT:
Antwoord strikt in JSON.`

    // User input - Nieuwe structuur met samenvattingen en adviezen
    const userInput = `Thema: ${theme.titel}
Beschrijving: ${theme.beschrijving_werknemer}${werkgeverConfig?.organisatie_omschrijving ? `\n\nOrganisatie context: ${werkgeverConfig.organisatie_omschrijving}` : ''}${teamContext}

THEMA SCORE: ${avgScore} (Schaal 1-10)
${heeftAlarmSignalen ? `
SCORE DISTRIBUTIE:
- Totaal medewerkers: ${validScores.length}
- Hoge scores (>= 7.0): ${hogeScores.length}
- Lage scores (< 4.0): ${lageScores.length} ⚠️
${zeerLageScores.length > 0 ? `- Zeer lage scores (< 3.0): ${zeerLageScores.length} 🚨` : ''}
` : `
SCORE DISTRIBUTIE:
- Totaal medewerkers: ${validScores.length}
- Hoge scores (>= 7.0): ${hogeScores.length}
- Lage scores (< 4.0): ${lageScores.length}
`}
${alarmSectie}
SAMENVATTINGEN VAN MEDEWERKERS:
${samenvattingenTekst}

ADVIEZEN VAN MEDEWERKERS:
${adviezenTekst || 'Geen adviezen beschikbaar'}

OPDRACHT:
Analyseer de samenvattingen en adviezen. Herken SEMANTISCHE PATRONEN:

PATROONHERKENNING:
- Kijk niet alleen naar exacte titel-matches, maar herken thema's en onderliggende problemen
- Als meerdere medewerkers vergelijkbare adviezen krijgen (bijv. "Maak een lijstje", "Creëer overzicht", "Prioriteer taken"), herken dan het patroon: er is behoefte aan structuur/planning
- Als veel adviezen gaan over communicatie (verschillende formuleringen), herken dan: communicatie is een thema
- Kijk naar de REDEN en RESULTAAT om de onderliggende behoefte te begrijpen
- Combineer informatie uit samenvattingen EN adviezen om het volledige beeld te krijgen

VOORBEELDEN VAN PATROONHERKENNING:
- 5x "lijstje maken" + 3x "overzicht creëren" + 2x "prioriteren" = PATROON: Behoefte aan structuur/planning
- 4x "gesprek met leidinggevende" + 3x "feedback vragen" = PATROON: Behoefte aan communicatie/begeleiding
- Veel adviezen over "tijd" of "druk" in de reden = PATROON: Werkdruk is een issue

Genereer:
1. Een scenario (CRISIS/VERBETEREN/BORGEN) op basis van de score ${avgScore}
2. Een samenvatting (max 80 woorden) die PATRONEN benoemt (niet individuele adviezen)
3. Drie leiderschaps-kaarten (Systeem, Leiderschap, Cultuur) waarbij:
   - Het SIGNAL refereert aan herkende PATRONEN en is KWANTITATIEF (gebruik relatieve termen zoals "een groot deel", "meerderheid", "aanzienlijk deel", bijv. "Een groot deel van de adviezen gaat over planning en overzicht, wat wijst op behoefte aan structuur")
   - De CTA is een pakkende, triggerende zin (max 12 woorden) die de manager aanzet om te klikken. Geen generieke tekst zoals "Lees meer", maar een uitnodigende actie die nieuwsgierigheid wekt en de strategische koers samenvat.
   - MICRO-ADVIEZEN: Precies 3 eenvoudige, direct uitvoerbare micro-adviezen per kaart die DIRECT AANSLUITEN op de CTA. De micro-adviezen zijn concrete stappen om de strategische richting uit de CTA te realiseren. Elke micro-advies heeft een korte actiegerichte titel (max 8 woorden) en een korte toelichting (max 15 woorden) die uitlegt waarom of hoe.

Antwoord strikt in JSON.`

    // 5. Stuur naar OpenAI Responses API (GPT-5.2)
    const response = await openaiClient.createResponse({
      model: 'gpt-5.2', // GPT-5.2 voor organisatie samenvatting
      instructions: systemInstructions,
      input: [{ role: 'user', content: userInput }],
      max_output_tokens: 4000,
      service_tier: 'default',
      text: {
        format: {
          type: 'json_schema',
          name: 'organisation_summary_output',
          schema: {
            type: 'object',
            properties: {
              scenario: {
                type: 'string',
                enum: ['CRISIS', 'VERBETEREN', 'BORGEN'],
                description: 'Het scenario op basis van de score'
              },
              samenvatting: {
                type: 'string',
                description: 'Samenvatting (max 80 woorden) in de toon van het scenario'
              },
              adviezen: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['Systeem', 'Leiderschap', 'Cultuur'],
                      description: 'Type kaart volgens Leiderschaps-Driehoek'
                    },
                    titel: {
                      type: 'string',
                      description: 'Actief & Strategisch (Max 6 woorden)'
                    },
                    signaal: {
                      type: 'string',
                      description: 'Signaal dat refereert aan kwantitatieve patronen uit de data. Gebruik relatieve termen zoals "een groot deel van het team", "meerderheid van de adviezen", "aanzienlijk deel", etc. Vermijd specifieke kleine aantallen zoals "1 van de 20" of vage uitspraken zoals "sommige medewerkers".'
                    },
                    cta: {
                      type: 'string',
                      description: "Pakkende, triggerende CTA (1 krachtige zin, max 12 woorden) die de manager aanzet om te klikken en de details te bekijken. Dit is een strategische oplossingsrichting die de te varen koers samenvat. Geen kleine afvinktaak, maar een uitnodigende actie die nieuwsgierigheid wekt. Voorbeelden: 'Ontdek hoe je de werkdruk structureel verlaagt', 'Bekijk het plan voor betere teamcommunicatie', 'Leer hoe je de planning optimaliseert'."
                    },
                    micro_adviezen: {
                      type: 'array',
                      description: 'TIJDELIJKE OPLOSSING: Array van precies 3 eenvoudige, direct uitvoerbare micro-adviezen. Elke micro-advies heeft een korte actiegerichte titel (max 8 woorden) en een korte toelichting (max 15 woorden) die uitlegt waarom of hoe. Opslag in tekst formaat in gpt_adviezen JSONB.',
                      items: {
                        type: 'object',
                        properties: {
                          titel: {
                            type: 'string',
                            description: 'Korte, actiegerichte titel (max 8 woorden) die direct duidelijk maakt wat te doen. Bijvoorbeeld: "Maak een weekplanning" of "Plan wekelijkse 1-op-1 gesprekken"'
                          },
                          toelichting: {
                            type: 'string',
                            description: 'Korte toelichting in kleine letters (max 15 woorden) die uitlegt waarom of hoe. Bijvoorbeeld: "Dit geeft overzicht en voorkomt dat taken vergeten worden"'
                          }
                        },
                        required: ['titel', 'toelichting'],
                        additionalProperties: false
                      },
                      minItems: 3,
                      maxItems: 3
                    }
                  },
                  required: ['type', 'titel', 'signaal', 'cta', 'micro_adviezen'],
                  additionalProperties: false
                },
                minItems: 3,
                maxItems: 3
              }
            },
            required: ['scenario', 'samenvatting', 'adviezen'],
            additionalProperties: false
          },
          strict: true
        }
      }
    })

    if (!response.success) {
      throw new Error(`OpenAI Responses API fout: ${response.error}`)
    }

    const gptResponse = response.data.output_text
    const parsed = JSON.parse(gptResponse)

    // 8. Sla op in database
    // Nieuwe structuur: scenario, samenvatting, adviezen
    // Voor backward compatibility: behoud oude velden waar mogelijk
    // TIJDELIJKE OPLOSSING: micro_adviezen worden opgeslagen in gpt_adviezen JSONB als tekst.
    // Inhoud: Array van objecten met {titel: string, toelichting: string} per advies.
    // Dit is een tijdelijke oplossing totdat een definitieve structuur is bepaald.
    const insightData = {
      organisatie_id,
      theme_id,
      team_id: effectiveTeamId || null, // team_id voor team-specifieke insights
      samenvatting: parsed.samenvatting,
      verbeteradvies: parsed.samenvatting, // Gebruik samenvatting als fallback voor backward compatibility
      signaalwoorden: [], // Leeg voor nieuwe structuur (wordt niet meer gebruikt)
      gpt_adviezen: {
        scenario: parsed.scenario,
        adviezen: parsed.adviezen, // Bevat nu ook micro_adviezen array per advies
        // Backward compatibility: behoud oude structuur
        prioriteit_1: parsed.adviezen?.[0]?.titel || '',
        prioriteit_2: parsed.adviezen?.[1]?.titel || '',
        prioriteit_3: parsed.adviezen?.[2]?.titel || ''
      },
      aantal_gesprekken: results.length,
      gemiddelde_score: avgScore,
      totaal_medewerkers: employees.length,
      voltooide_medewerkers: results.length,
      samenvatting_status: 'handmatig',
      laatst_bijgewerkt_op: new Date().toISOString()
    }

    // Update of insert
    let existingQuery = supabase
      .from('organization_theme_insights')
      .select('id')
      .eq('organisatie_id', organisatie_id)
      .eq('theme_id', theme_id)

    // Filter op team_id als opgegeven, anders organisatie-breed (team_id IS NULL)
    if (effectiveTeamId) {
      existingQuery = existingQuery.eq('team_id', effectiveTeamId)
    } else {
      existingQuery = existingQuery.is('team_id', null)
    }

    const { data: existingInsight, error: existingError } = await existingQuery.single()

    if (existingError && existingError.code !== 'PGRST116') {
      throw existingError
    }

    if (existingInsight) {
      // Update bestaande
      const { error: updateError } = await supabase
        .from('organization_theme_insights')
        .update(insightData)
        .eq('id', existingInsight.id)

      if (updateError) throw updateError
    } else {
      // Insert nieuwe
      const { error: insertError } = await supabase
        .from('organization_theme_insights')
        .insert(insightData)

      if (insertError) throw insertError
    }

    res.json({
      success: true,
      team_context: teamInfo ? {
        team_id: effectiveTeamId,
        team_naam: teamInfo.naam,
        team_beschrijving: teamInfo.teams_beschrijving
      } : null,
      scenario: parsed.scenario,
      samenvatting: parsed.samenvatting,
      adviezen: parsed.adviezen,
      gemiddelde_score: avgScore,
      aantal_gesprekken: results.length,
      // Backward compatibility
      verbeteradvies: parsed.samenvatting,
      gpt_adviezen: {
        scenario: parsed.scenario,
        adviezen: parsed.adviezen,
        prioriteit_1: parsed.adviezen?.[0]?.titel || '',
        prioriteit_2: parsed.adviezen?.[1]?.titel || '',
        prioriteit_3: parsed.adviezen?.[2]?.titel || ''
      },
      signaalwoorden: []
    })

  } catch (err) {
    console.error('Fout bij genereren organisatie samenvatting:', err)
    res.status(500).json({ error: 'Fout bij genereren organisatie samenvatting' })
  }
})

module.exports = router
