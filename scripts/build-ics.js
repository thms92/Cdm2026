#!/usr/bin/env node
// =============================================================================
//  Générateur des matchs à élimination directe (8es → finale) du calendrier.
//
//  Régénère UNIQUEMENT les événements des matchs 89 à 104 (UID `ko-m##`) dans
//  cdm2026.ics et cdm2026-alerte.ics, à partir des données live openfootball.
//  Dès qu'un tour est joué, openfootball renseigne les vraies équipes du tour
//  suivant → elles apparaissent automatiquement dans le calendrier des abonnés.
//
//  Les 72 matchs de poules et les 16 seizièmes (UID `r32-m##`), déjà connus et
//  définitifs, ne sont PAS touchés (UID conservés → aucune resynchro inutile).
//
//  Exécuté par la GitHub Action .github/workflows/update-calendar.yml.
// =============================================================================
"use strict";
const fs = require("fs");
const path = require("path");

const DATA_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const ROOT = path.join(__dirname, "..");

// openfootball (nom anglais) → drapeau + nom français
const FLAGS = {
  "Mexico":"🇲🇽 Mexique","South Africa":"🇿🇦 Afrique du Sud","South Korea":"🇰🇷 Corée du Sud",
  "Canada":"🇨🇦 Canada","Qatar":"🇶🇦 Qatar","Switzerland":"🇨🇭 Suisse",
  "Brazil":"🇧🇷 Brésil","Morocco":"🇲🇦 Maroc","Haiti":"🇭🇹 Haïti","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿 Écosse",
  "USA":"🇺🇸 USA","United States":"🇺🇸 USA","Paraguay":"🇵🇾 Paraguay","Australia":"🇦🇺 Australie",
  "Germany":"🇩🇪 Allemagne","Curaçao":"🇨🇼 Curaçao","Ivory Coast":"🇨🇮 Côte d'Ivoire","Ecuador":"🇪🇨 Équateur",
  "Netherlands":"🇳🇱 Pays-Bas","Japan":"🇯🇵 Japon","Tunisia":"🇹🇳 Tunisie",
  "Belgium":"🇧🇪 Belgique","Egypt":"🇪🇬 Égypte","Iran":"🇮🇷 Iran","New Zealand":"🇳🇿 Nouvelle-Zélande",
  "Spain":"🇪🇸 Espagne","Cape Verde":"🇨🇻 Cap-Vert","Saudi Arabia":"🇸🇦 Arabie Saoudite","Uruguay":"🇺🇾 Uruguay",
  "France":"🇫🇷 France","Senegal":"🇸🇳 Sénégal","Norway":"🇳🇴 Norvège",
  "Argentina":"🇦🇷 Argentine","Algeria":"🇩🇿 Algérie","Austria":"🇦🇹 Autriche","Jordan":"🇯🇴 Jordanie",
  "Portugal":"🇵🇹 Portugal","Uzbekistan":"🇺🇿 Ouzbékistan","Colombia":"🇨🇴 Colombie",
  "England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿 Angleterre","Croatia":"🇭🇷 Croatie","Ghana":"🇬🇭 Ghana","Panama":"🇵🇦 Panama",
  "DR Congo":"🇨🇩 RD Congo","Iraq":"🇮🇶 Irak","Czech Republic":"🇨🇿 Tchéquie","Czechia":"🇨🇿 Tchéquie"
};

const ROUND_FR = {
  "Round of 16":"8e de finale", "Quarter-final":"Quart de finale",
  "Semi-final":"Demi-finale", "Match for third place":"Match pour la 3e place",
  "Final":"Finale"
};
const ROUND_EMO = { "Match for third place":"🥉" };  // les autres : 🏆

function pad(n){ return String(n).padStart(2, "0"); }
function teamDisp(name){ return FLAGS[name] || ("🏳️ " + name); }
function isPlaceholder(t){ return /^[WL]\d+$/.test(t); }
function slotFr(t){
  const w = /^W(\d+)$/.exec(t); if (w) return "Vainqueur M" + w[1];
  const l = /^L(\d+)$/.exec(t); if (l) return "Perdant M" + l[1];
  return t;
}
function city(ground){
  let c = String(ground || "").replace(/\s*\(.*\)\s*$/, "").trim();
  if (c === "San Francisco Bay Area") c = "San Francisco";
  return c;
}
// "17:00 UTC-4" + "2026-07-04" → { start, end } en heure de Paris (CEST = UTC+2)
function parisTimes(date, time){
  const m = /^(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})$/.exec(String(time || "").trim());
  const [Y, Mo, D] = date.split("-").map(Number);
  const hh = m ? +m[1] : 12, mi = m ? +m[2] : 0, off = m ? +m[3] : 0;
  const utcMs = Date.UTC(Y, Mo - 1, D, hh - off, mi);
  const fmt = ms => { const d = new Date(ms + 2 * 3600e3);   // +2h → Paris
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`; };
  return { start: fmt(utcMs), end: fmt(utcMs + 2 * 3600e3) };
}

function buildEvent(mt, withAlarm){
  const num = +mt.num;
  const roundFr = ROUND_FR[mt.round] || mt.round;
  const emo = ROUND_EMO[mt.round] || "🏆";
  const t1 = mt.team1, t2 = mt.team2;
  const known = t1 && t2 && !isPlaceholder(t1) && !isPlaceholder(t2);
  const tm = parisTimes(mt.date, mt.time);
  const ville = city(mt.ground);

  let summary, desc;
  if (known){
    const star = (t1 === "France" || t2 === "France") ? "⭐ " : "";
    summary = star + teamDisp(t1) + " vs " + teamDisp(t2);
    desc = `Coupe du Monde FIFA 2026 - ${roundFr} (M${num}) - ${ville}`;
  } else {
    summary = `${emo} ${roundFr}`;
    desc = `Coupe du Monde FIFA 2026 - ${roundFr} (M${num}) · ${slotFr(t1)} vs ${slotFr(t2)} - ${ville}`;
  }

  let s = "BEGIN:VEVENT\n" +
    `UID:ko-m${num}@cdm2026\n` +
    "DTSTAMP:20260628T000000Z\n" +
    `SEQUENCE:${known ? 1 : 0}\n` +
    `DTSTART;TZID=Europe/Paris:${tm.start}\n` +
    `DTEND;TZID=Europe/Paris:${tm.end}\n` +
    `SUMMARY:${summary}\n` +
    `LOCATION:${ville}\n` +
    `DESCRIPTION:${desc}\n`;
  if (withAlarm) s += "BEGIN:VALARM\nTRIGGER:-PT15M\nACTION:DISPLAY\nDESCRIPTION:Match dans 15 min\nEND:VALARM\n";
  return s + "END:VEVENT\n";
}

function rebuild(file, withAlarm, koMatches){
  const full = path.join(ROOT, file);
  let c = fs.readFileSync(full, "utf8");
  const endIdx = c.indexOf("END:VCALENDAR");
  if (endIdx === -1) throw new Error("END:VCALENDAR introuvable dans " + file);
  const body = c.slice(0, endIdx);
  const blocks = body.split(/(?=BEGIN:VEVENT)/);
  const header = blocks.shift();                                   // en-tête + VTIMEZONE
  const kept = blocks.filter(b => !/UID:ko-m\d+@cdm2026/.test(b)); // on retire les anciens ko-m##
  const fresh = koMatches.map(mt => buildEvent(mt, withAlarm)).join("");
  fs.writeFileSync(full, header + kept.join("") + fresh + "END:VCALENDAR\n");
  return kept.length + koMatches.length;
}

(async function main(){
  const res = await fetch(DATA_URL, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error("openfootball HTTP " + res.status);
  const data = await res.json();
  const ko = (data.matches || [])
    .filter(m => +m.num >= 89 && +m.num <= 104)
    .sort((a, b) => a.num - b.num);
  if (ko.length !== 16) console.warn(`⚠️  ${ko.length} matchs 89-104 trouvés (attendu 16).`);

  const n1 = rebuild("cdm2026.ics", false, ko);
  const n2 = rebuild("cdm2026-alerte.ics", true, ko);
  const known = ko.filter(m => m.team1 && !/^[WL]\d+$/.test(m.team1) && m.team2 && !/^[WL]\d+$/.test(m.team2)).length;
  console.log(`✅ Régénéré ${ko.length} matchs K.O. (${known} avec équipes connues) · ${n1}/${n2} événements au total.`);
})().catch(e => { console.error("❌ " + e.message); process.exit(1); });
