/**
 * Lighthouse Performance Audit Script
 *
 * Usage:
 *   node scripts/lighthouse.mjs              # default pages
 *   node scripts/lighthouse.mjs --url=http://localhost:3000
 *   node scripts/lighthouse.mjs --threshold=75
 *
 * Output: reports/lighthouse/YYYY-MM-DD/
 */

import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ──────────────────────────────────────────────
const BASE_URL = process.env.PERF_URL || 'http://localhost:3000';

const PAGES = [
  { path: '/', label: 'Home' },
  { path: '/login', label: 'Login' },
  { path: '/register', label: 'Register' },
  { path: '/health', label: 'Health' },
];

const THRESHOLDS = {
  performance: parseInt(process.env.PERF_THRESHOLD || '80', 10),
  accessibility: parseInt(process.env.PERF_THRESHOLD || '90', 10),
  'best-practices': parseInt(process.env.PERF_THRESHOLD || '90', 10),
  seo: parseInt(process.env.PERF_THRESHOLD || '90', 10),
};

// ── Helpers ────────────────────────────────────────────────────
function getReportDir() {
  const today = new Date().toISOString().split('T')[0];
  const dir = path.join(__dirname, '..', 'reports', 'lighthouse', today);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function scoreLabel(score) {
  if (score >= 0.9) return '🟢';
  if (score >= 0.5) return '🟡';
  return '🔴';
}

function formatScore(score) {
  return Math.round(score * 100);
}

// ── Main ───────────────────────────────────────────────────────
async function runAudit() {
  console.log('🔍 Lighthouse Performance Audit');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`📊 Thresholds: perf=${THRESHOLDS.performance}, a11y=${THRESHOLDS.accessibility}, bp=${THRESHOLDS['best-practices']}, seo=${THRESHOLDS.seo}`);
  console.log(`📄 Pages: ${PAGES.length}`);
  console.log('');

  const reportDir = getReportDir();
  const results = [];
  let allPassed = true;

  // Launch Chrome
  console.log('🚀 Launching Chrome...');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  });

  try {
    for (const page of PAGES) {
      const url = `${BASE_URL}${page.path}`;
      console.log(`\n📄 Auditing: ${page.label} (${url})`);

      try {
        const runnerResult = await lighthouse(url, {
          port: chrome.port,
          formFactor: 'mobile',
          screenEmulation: { disabled: true },
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        });

        const categories = runnerResult.lhr.categories;
        const scores = {
          performance: categories.performance?.score ?? 0,
          accessibility: categories.accessibility?.score ?? 0,
          'best-practices': categories['best-practices']?.score ?? 0,
          seo: categories.seo?.score ?? 0,
        };

        // Check thresholds
        const passed = Object.entries(scores).every(([key, value]) => {
          const threshold = THRESHOLDS[key];
          if (value < threshold / 100) {
            console.log(`  ⚠️  ${key}: ${formatScore(value)} (threshold: ${threshold})`);
            return false;
          }
          return true;
        });

        if (!passed) allPassed = false;

        results.push({ page: page.label, path: page.path, ...scores, passed });

        // Save individual HTML report
        const htmlReport = runnerResult.report;
        const safeLabel = page.label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        fs.writeFileSync(
          path.join(reportDir, `${safeLabel}.html`),
          htmlReport,
          'utf-8'
        );

        // Save individual JSON report
        fs.writeFileSync(
          path.join(reportDir, `${safeLabel}.json`),
          JSON.stringify(runnerResult.lhr, null, 2),
          'utf-8'
        );

        // Console summary
        const perfIcon = scoreLabel(scores.performance);
        const a11yIcon = scoreLabel(scores.accessibility);
        const bpIcon = scoreLabel(scores['best-practices']);
        const seoIcon = scoreLabel(scores.seo);
        console.log(`  ${perfIcon} Performance: ${formatScore(scores.performance)}`);
        console.log(`  ${a11yIcon} Accessibility: ${formatScore(scores.accessibility)}`);
        console.log(`  ${bpIcon} Best Practices: ${formatScore(scores['best-practices'])}`);
        console.log(`  ${seoIcon} SEO: ${formatScore(scores.seo)}`);
        console.log(`  ${passed ? '✅ PASSED' : '❌ FAILED'} thresholds`);

      } catch (err) {
        console.error(`  ❌ Error auditing ${page.label}:`, err.message);
        results.push({ page: page.label, path: page.path, error: err.message, passed: false });
        allPassed = false;
      }
    }
  } finally {
    await chrome.kill();
  }

  // ── Generate Summary ─────────────────────────────────────────
  const summaryMd = generateSummaryMd(results);
  fs.writeFileSync(path.join(reportDir, 'summary.md'), summaryMd, 'utf-8');

  const summaryJson = JSON.stringify(results, null, 2);
  fs.writeFileSync(path.join(reportDir, 'results.json'), summaryJson, 'utf-8');

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(summaryMd);
  console.log(`\n📁 Reports saved to: ${reportDir}`);

  if (!allPassed) {
    console.log('\n⚠️  Some pages did not meet thresholds');
    process.exit(1);
  } else {
    console.log('\n✅ All pages passed thresholds');
  }
}

function generateSummaryMd(results) {
  const header = `# Lighthouse Performance Report\n\n> Date: ${new Date().toISOString().split('T')[0]}\n> URL: ${BASE_URL}\n> Strategy: Mobile\n\n## Scores\n\n| Page | Performance | Accessibility | Best Practices | SEO | Status |\n|------|-------------|---------------|----------------|-----|--------|\n`;

  const rows = results.map(r => {
    if (r.error) {
      return `| ${r.page} | ❌ Error | - | - | - | ❌ |\n`;
    }
    const perf = `${scoreLabel(r.performance)} ${formatScore(r.performance)}`;
    const a11y = `${scoreLabel(r.accessibility)} ${formatScore(r.accessibility)}`;
    const bp = `${scoreLabel(r['best-practices'])} ${formatScore(r['best-practices'])}`;
    const seo = `${scoreLabel(r.seo)} ${formatScore(r.seo)}`;
    const status = r.passed ? '✅' : '❌';
    return `| ${r.page} | ${perf} | ${a11y} | ${bp} | ${seo} | ${status} |\n`;
  }).join('');

  const thresholds = `\n## Thresholds\n\n| Category | Minimum |\n|----------|--------|\n| Performance | ${THRESHOLDS.performance} |\n| Accessibility | ${THRESHOLDS.accessibility} |\n| Best Practices | ${THRESHOLDS['best-practices']} |\n| SEO | ${THRESHOLDS.seo} |\n`;

  return header + rows + thresholds;
}

// ── Run ────────────────────────────────────────────────────────
runAudit().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
