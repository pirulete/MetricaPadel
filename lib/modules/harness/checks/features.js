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

  // Skip partial paths like "[slug]/page.tsx" or "blog/page.tsx" — these are
  // inline descriptions, not full file references from the Archivos table.
  // Full refs have at least one directory component before the filename.
  const parts = ref.split('/');
  if (parts.length === 2 && !parts[0].includes('(') && !parts[0].includes('app')) {
    // Two-part ref without parentheses or "app" — likely a partial path
    // Exception: allow if it starts with a known top-level dir
    const knownTopDirs = ['app', 'lib', 'tests', 'components', 'hooks', 'drizzle', 'scripts', 'public', 'types', 'blueprint'];
    if (!knownTopDirs.includes(parts[0])) {
      return false;
    }
  }

  if (ref.includes('/')) return true;
  if (ref.startsWith('_')) return true;
  return false;
}

/**
 * Expands brace expansion patterns like "foo/{a,b,c}/bar.ts" into
 * ["foo/a/bar.ts", "foo/b/bar.ts", "foo/c/bar.ts"].
 * Also handles "[slug]" as literal directory names.
 * @param {string} ref
 * @returns {string[]}
 */
function expandBraces(ref) {
  const braceMatch = ref.match(/\{([^}]+)\}/);
  if (!braceMatch) return [ref];

  const alternatives = braceMatch[1].split(',').map(s => s.trim());
  const prefix = ref.slice(0, braceMatch.index);
  const suffix = ref.slice(braceMatch.index + braceMatch[0].length);

  const expanded = [];
  for (const alt of alternatives) {
    expanded.push(...expandBraces(prefix + alt + suffix));
  }
  return expanded;
}

/**
 * Normalizes a file ref for path checking:
 * - Treats [slug] as a literal directory name (not glob)
 * - Expands {a,b,c} brace patterns
 * @param {string} ref
 * @returns {string[]}
 */
function normalizeFileRef(ref) {
  // Expand brace patterns first
  const expanded = expandBraces(ref);
  return expanded;
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
    // Expand brace patterns like {a,b,c} into individual paths
    const expandedRefs = normalizeFileRef(ref);
    let found = false;
    for (const expandedRef of expandedRefs) {
      const fullPath = path.join(projectRoot, expandedRef);
      if (fs.existsSync(fullPath)) {
        found = true;
        break;
      }
    }
    if (!found) {
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
