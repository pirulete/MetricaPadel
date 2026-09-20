/**
 * Risk Matrix — AOSE T4: nivel de autonomía por riesgo de cambio.
 *
 * CJS (module.exports) para que tanto validate-harness.js (ESM) como los
 * unit tests de Jest (CJS) puedan consumir la misma lógica sin duplicarla.
 *
 * Portado desde StreetMove y adaptado al skeleton: se eliminaron las rutas de
 * dominio StreetMove (plans, check-ins, gamification, gmail-sync, payments,
 * reservations, etc.) y se agregaron las del skeleton (marketing CMS).
 *
 * Un cambio toca rutas sensibles → HIGH (requiere evidencia + gates completos).
 * La clasificación es determinista: el agente no decide su propia autonomía.
 */
"use strict";

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"];

/**
 * Orden descendente: reglas de mayor riesgo primero.
 * filePath normalizado a minúsculas y separador '/'.
 */
const RISK_RULES = [
  { risk: "HIGH", patterns: [
    /(^|\/)auth(\/|\.|$)/, /csrf/, /session/, /password/, /hashing/, /bcrypt/, /nextauth/,
    /drizzle\/|schema\.ts|_journal\.json|\.sql$/,
    /csv/, /bulk/, /reset-password/, /verify-email/, /forgot-password/,
  ]},
  { risk: "MEDIUM", patterns: [
    /app\/api\/admin\/users/, /app\/api\/admin\/marketing/,
    /lib\/db\//, /queries\.ts/, /admin-guard/, /role-utils/, /protected-routes/,
    /lib\/audit/, /lib\/marketing/, /lib\/validations\//,
  ]},
];

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").toLowerCase();
}

/**
 * Clasifica un archivo por riesgo. Default LOW.
 * @param {string} filePath
 * @returns {"LOW"|"MEDIUM"|"HIGH"}
 */
function getFileRisk(filePath) {
  const p = normalizePath(filePath);
  if (!p) return "LOW";
  for (const rule of RISK_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(p)) return rule.risk;
    }
  }
  return "LOW";
}

/**
 * Máximo riesgo entre una lista de archivos cambiados.
 * @param {string[]} paths
 * @returns {{ risk: "LOW"|"MEDIUM"|"HIGH", most_sensitive_file: string|null }}
 */
function getMaxRisk(paths) {
  const list = Array.isArray(paths) ? paths : [];
  let risk = "LOW";
  let mostSensitiveFile = null;
  for (const p of list) {
    const r = getFileRisk(p);
    const idx = RISK_LEVELS.indexOf(r);
    if (idx > RISK_LEVELS.indexOf(risk)) {
      risk = r;
      mostSensitiveFile = p;
    }
  }
  return { risk, most_sensitive_file: mostSensitiveFile };
}

module.exports = { getFileRisk, getMaxRisk, RISK_LEVELS, RISK_RULES };