/**
 * Risk Policy — tipos TypeScript para lib/policy/risk-rules.js.
 *
 * risk-rules.js es la fuente de verdad (CJS, JSDoc types).
 * Este archivo exporta solo tipos para consumidores TypeScript.
 *
 * Uso:
 *   import type { RiskLevel, RiskResult } from "@/lib/modules/harness/risk-policy";
 *   import { getFileRisk } from "../../../lib/policy/risk-rules.js";
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskResult {
  risk: RiskLevel;
  most_sensitive_file: string | null;
}

export interface RiskRule {
  risk: RiskLevel;
  patterns: RegExp[];
}
