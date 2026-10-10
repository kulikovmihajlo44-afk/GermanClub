// Placement test. The answer key lives only here (server side); /api/app?a=test.questions sends questions without it.
// Indicative only: 30 questions, 3 skills (grammar, vocabulary, reading), 5 levels, 2 questions per skill and level.
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const SKILLS = ['grammar', 'vocab', 'reading'];
const ITEMS = [
  { id: "g1", skill: "grammar", level: "A1", text: "", q: "Ich ___ aus der Ukraine.", options: ["komme", "kommst", "kommt", "kommen"], a: 0 },
  { id: "g2", skill: "grammar", level: "A1", text: "", q: "Morgen ___ ich in die Uni.", options: ["gehe", "ich gehe", "gehst", "gehen"], a: 0 },
  { id: "v1", skill: "vocab", level: "A1", text: "", q: "Ich trinke jetzt Wasser, denn ich habe ___.", options: ["Hunger", "Angst", "Durst", "Zeit"], a: 2 },
  { id: "v2", skill: "vocab", level: "A1", text: "", q: "Der Bus fährt nicht. Ich gehe zu ___.", options: ["Hand", "Fuß", "Haus", "Weg"], a: 1 },
  { id: "r1", skill: "reading", level: "A1", text: "Hallo! Ich heiße Anna. Ich bin 20 Jahre alt und wohne in Bremen. Ich lerne Deutsch.", q: "Where does Anna live?", options: ["Berlin", "Hamburg", "Bremen", "Vienna"], a: 2 },
  { id: "r2", skill: "reading", level: "A1", text: "Der Supermarkt ist von Montag bis Samstag von 8 bis 20 Uhr geöffnet. Sonntags ist geschlossen.", q: "When can you NOT shop there?", options: ["On Saturday evening", "On Sundays", "On Monday morning", "On Friday"], a: 1 },
  { id: "g3", skill: "grammar", level: "A2", text: "", q: "Gestern ___ ich im Kino.", options: ["bin", "habe", "war", "werde"], a: 2 },
  { id: "g4", skill: "grammar", level: "A2", text: "", q: "Ich habe gestern einen Film ___.", options: ["sehen", "gesehen", "gesieht", "sah"], a: 1 },
  { id: "v3", skill: "vocab", level: "A2", text: "", q: "Ich möchte einen Termin beim Arzt ___.", options: ["verlieren", "vereinbaren", "verstehen", "verbieten"], a: 1 },
  { id: "v4", skill: "vocab", level: "A2", text: "", q: "Der Zug hatte Ausfall, deshalb habe ich mich ___.", options: ["verspätet", "verlobt", "verloren", "verbessert"], a: 0 },
  { id: "r3", skill: "reading", level: "A2", text: "Liebe Marie, leider kann ich am Samstag nicht zu deiner Party kommen, weil ich arbeiten muss. Wollen wir stattdessen am Sonntag Kaffee trinken? Viele Grüße, Tom", q: "Why can’t Tom come to the party?", options: ["He is ill", "He is on holiday", "He has to work", "He forgot the date"], a: 2 },
  { id: "r4", skill: "reading", level: "A2", text: "Der Zug nach München fährt heute von Gleis 7, nicht von Gleis 3. Die Abfahrt verspätet sich um 15 Minuten.", q: "What has changed?", options: ["Only the platform", "The platform, and the train is 15 minutes late", "The train is cancelled", "Only the departure time"], a: 1 },
  { id: "g5", skill: "grammar", level: "B1", text: "", q: "Ich weiß nicht, ob er morgen ___.", options: ["kommen", "kommt er", "kommt", "gekommt"], a: 2 },
  { id: "g6", skill: "grammar", level: "B1", text: "", q: "Wenn ich mehr Zeit ___, würde ich öfter reisen.", options: ["habe", "hatte", "hätte", "haben"], a: 2 },
  { id: "v5", skill: "vocab", level: "B1", text: "", q: "Ich bewerbe mich um eine Stelle. Dafür brauche ich einen ___.", options: ["Fahrplan", "Lebenslauf", "Wetterbericht", "Urlaub"], a: 1 },
  { id: "v6", skill: "vocab", level: "B1", text: "", q: "Das Wetter ist unsicher, wir müssen den Ausflug ___.", options: ["verbessern", "verbieten", "verschieben", "verdienen"], a: 2 },
  { id: "r5", skill: "reading", level: "B1", text: "Viele Studierende arbeiten neben dem Studium, weil die Lebenshaltungskosten in der Stadt gestiegen sind. Allerdings haben sie dadurch weniger Zeit zum Lernen.", q: "What is the downside for working students?", options: ["Rents have fallen", "They cannot find jobs", "Universities are too expensive", "They have less time to study"], a: 3 },
  { id: "r6", skill: "reading", level: "B1", text: "Obwohl der Film schlechte Kritiken bekam, ging ich hin – und war angenehm überrascht.", q: "How did the author feel after the film?", options: ["Disappointed", "Pleasantly surprised", "Bored", "Angry"], a: 1 },
  { id: "g7", skill: "grammar", level: "B2", text: "", q: "Das Buch, ___ ich gestern gelesen habe, war spannend.", options: ["dem", "was", "das", "dessen"], a: 2 },
  { id: "g8", skill: "grammar", level: "B2", text: "", q: "Trotz ___ Regens gingen wir spazieren.", options: ["dem", "der", "den", "des"], a: 3 },
  { id: "v7", skill: "vocab", level: "B2", text: "", q: "Die Regierung will die Steuern ___.", options: ["sinken", "senken", "sehen", "sparen"], a: 1 },
  { id: "v8", skill: "vocab", level: "B2", text: "", q: "Bei dem Unfall hat er sich schwer ___.", options: ["verloren", "verlassen", "verletzt", "verkauft"], a: 2 },
  { id: "r7", skill: "reading", level: "B2", text: "Die Einführung der Vier-Tage-Woche wird kontrovers diskutiert. Befürworter verweisen auf höhere Zufriedenheit der Beschäftigten, Kritiker befürchten Produktivitätsverluste in kleinen Betrieben.", q: "What do critics fear?", options: ["Lower satisfaction", "Higher costs for employees", "Lower productivity in small firms", "Fewer job applicants"], a: 2 },
  { id: "r8", skill: "reading", level: "B2", text: "Der Autor räumt ein, dass seine Studie nicht repräsentativ sei, hält ihre Ergebnisse jedoch für aufschlussreich.", q: "What does the author admit?", options: ["The results are wrong", "The study is not representative", "The study was too expensive", "Nobody read it"], a: 1 },
  { id: "g9", skill: "grammar", level: "C1", text: "", q: "Er tat so, als ___ er nichts davon gewusst.", options: ["hat", "wäre", "wurde", "hätte"], a: 3 },
  { id: "g10", skill: "grammar", level: "C1", text: "", q: "Die Ergebnisse, ___ Ursachen noch unklar sind, wurden veröffentlicht.", options: ["dessen", "die", "denen", "deren"], a: 3 },
  { id: "v9", skill: "vocab", level: "C1", text: "", q: "Der Politiker wies die Vorwürfe entschieden ___.", options: ["ein", "vor", "zurück", "an"], a: 2 },
  { id: "v10", skill: "vocab", level: "C1", text: "", q: "Seine Argumentation ist nicht ___: Sie enthält Widersprüche.", options: ["schlüssig", "schlicht", "schließlich", "schlüsselfertig"], a: 0 },
  { id: "r9", skill: "reading", level: "C1", text: "Dass die Reform scheitern würde, hatte kaum jemand bezweifelt; überraschend war allenfalls das Tempo, mit dem sie unterging.", q: "What surprised observers?", options: ["That it was passed", "Who opposed it", "That it failed at all", "How quickly it failed"], a: 3 },
  { id: "r10", skill: "reading", level: "C1", text: "Wer die Beweislast trägt, ist in der Praxis oft wichtiger als die Frage, wer im Recht ist, denn Unklarheit geht zulasten dessen, der beweisen muss.", q: "According to the text, who suffers from uncertainty?", options: ["The judge", "The party who must prove the claim", "The party who is right", "The witnesses"], a: 1 }
];

function publicQuestions() {
  return ITEMS.map(({ id, skill, text, q, options }) => ({ id, skill, text, q, options }));
}

// answers: { [id]: chosenIndex }  (anything else, e.g. -1 = "I don't know", counts as wrong)
function score(answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const right = {}; ITEMS.forEach((it) => { right[it.id] = Number.isInteger(a[it.id]) && a[it.id] === it.a; });
  // overall: a level is passed when >= 4 of its 6 questions are right; the level is the last pass in an unbroken chain from A1
  let overall = 'A0';
  for (const L of LEVELS) {
    const its = ITEMS.filter((i) => i.level === L);
    const n = its.filter((i) => right[i.id]).length;
    if (n >= 4) overall = L; else break;
  }
  // per skill: highest level where the cumulative accuracy up to that level is >= 60%
  const skills = {};
  for (const s of SKILLS) {
    let lvl = 'A0';
    LEVELS.forEach((L, k) => {
      const upto = ITEMS.filter((i) => i.skill === s && LEVELS.indexOf(i.level) <= k);
      const n = upto.filter((i) => right[i.id]).length;
      if (n / upto.length >= 0.6 && ITEMS.some((i) => i.skill === s && i.level === L && right[i.id])) lvl = L;
    });
    skills[s] = lvl;
  }
  const total = ITEMS.length, got = ITEMS.filter((i) => right[i.id]).length;
  return { level: overall, skills, score: got, total };
}

module.exports = { ITEMS, LEVELS, SKILLS, publicQuestions, score };
