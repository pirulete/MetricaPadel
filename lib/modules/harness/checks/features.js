/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Harness Check: FEATURES.md file references.
 * CJS para compatibilidad con Jest y harness.
 */
"use strict";

const fs = require("fs");
const path = require("path");

function isKnownFileRef(ref) {
  if (ref.startsWith("http")) return false;
  if (/^(POST|GET|PUT|DELETE|HEAD|PATCH)\s/.test(ref)) return false;
  if (/^@[\w-]+\/[\w-]+/.test(ref)) return false;
  if (ref.startsWith("/")) return false;
  if (ref.includes("node_modules")) return false;
  if (/^pnpm |^npm |^npx |^yarn |^node /.test(ref)) return false;
  if (/\n/.test(ref)) return false;
  if (ref.length > 120) return false;
  if (/=>/.test(ref)) return false;
  if (/^(import |export |const |let |var |function |return )/.test(ref)) return false;
  if (/@/.test(ref)) return false;
  if (ref.startsWith('.')) return false;
  if (/^[a-z]+\.[a-z]+$/.test(ref)) return false;
  if (/<.*>/.test(ref)) return false;
  if (ref.includes("*")) return false;
  if (ref.includes("YYYY-MM-DD")) return false;

  const extMatch = ref.match(/\.(\w+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const knownExts = ['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'sql', 'md', 'env', 'txt', 'mjs', 'mts', 'toml', 'yaml', 'yml'];
  const hasKnownExt = knownExts.includes(ext);

  if (!hasKnownExt) return false;

  if (ref.includes('/')) return true;
  if (ref.startsWith('_')) return true;
  return false;
}

function checkFeaturesFiles(projectRoot) {
  process.stdout.write(`  ⏳ FEATURES.md file references... `);
  const featuresPath = path.join(projectRoot, "FEATURES.md");
  if (!fs.existsSync(featuresPath)) {
    process.stdout.write("❌ (FEATURES.md not found)\n");
    return { passed: false, output: "FEATURES.md not found" };
  }

  const content = fs.readFileSync(featuresPath, "utf-8");
  const lines = content.split('\n');
  const fileRefs = [];

  for (const line of lines) {
    const regex = /`([^`]+)`/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      const ref = match[1].trim();
      if (isKnownFileRef(ref)) {
        fileRefs.push(ref);
      }
    }
  }

  const missing = [];
  for (const ref of fileRefs) {
    const fullPath = path.join(projectRoot, ref);
    if (!fs.existsSync(fullPath)) {
      missing.push(ref);
    }
  }

  if (missing.length > 0) {
    process.stdout.write(`❌ (${missing.length} missing)\n`);
    return { passed: false, output: `Missing files referenced in FEATURES.md:\n${missing.map(f => `  - ${f}`).join("\n")}` };
  }

  process.stdout.write(`✅ (${fileRefs.length} references checked)\n`);
  return { passed: true, output: `${fileRefs.length} file references checked, all exist` };
}

module.exports = { checkFeaturesFiles };
