/**
 * PageSpeed Insights Performance Audit Script
 *
 * Usage:
 *   node scripts/pagespeed.mjs              # default pages, mobile + desktop
 *   node scripts/pagespeed.mjs --url=http://localhost:3000
 *   node scripts/pagespeed.mjs --threshold=75
 *
 * Output: reports/pagespeed/YYYY-MM-DD/
 *
 * Uses Google PageSpeed Insights API (no browser required).
 * API: https://developers.google.com/speed/docs/insights/v5/about
 */

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

const STRATEGIES = ['mobile', 'desktop'];

const THRESHOLDS = {
  performance: parseInt(process.env.PERF_THRESHOLD || '80', 10),
  accessibility: parseInt(process.env.PERF_THRESHOLD || '90', 10),
  'best-practices': parseInt(process.env.PERF_THRESHOLD || '90', 10),
  seo: parseInt(process.env.PERF_THRESHOLD || '90', 10),
};

// ── Helpers ────────────────────────────────────────────────────
function getReportDir() {
  const today = new Date().toISOString().split('T')[0];
  const dir = path.join(__dirname, '..', 'reports', 'pagespeed', today);
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

async function fetchPSI(url, strategy, retries = 3) {
  const apiKey = process.env.PERF_PSI_API_KEY || '';
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=PERFORMANCE&category=ACCESSIBILITY&category=BEST_PRACTICES&category=SEO${apiKey ? `&key=${apiKey}` : ''}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(apiUrl);
    if (response.ok) {
      return response.json();
    }
    if (response.status === 429 && attempt < retries) {
      const waitTime = 15000 * attempt; // 15s, 30s, 45s
      console.log(`  ⏳ Rate limited (429). Retrying in ${waitTime / 1000}s... (attempt ${attempt}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    throw new Error(`PSI API error: ${response.status} ${response.statusText}`);
  }
}

// ── Main ───────────────────────────────────────────────────────
async function runAudit() {
  console.log('🔍 PageSpeed Insights Audit');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`📊 Thresholds: perf=${THRESHOLDS.performance}, a11y=${THRESHOLDS.accessibility}, bp=${THRESHOLDS['best-practices']}, seo=${THRESHOLDS.seo}`);
  console.log(`📱 Strategies: ${STRATEGIES.join(', ')}`);
  console.log(`📄 Pages: ${PAGES.length}`);
  console.log('');

  const reportDir = getReportDir();
  const allResults = {};
  let allPassed = true;

  for (const strategy of STRATEGIES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📱 Strategy: ${strategy.toUpperCase()}`);
    console.log('='.repeat(60));

    const strategyResults = [];

    for (const page of PAGES) {
      const url = `${BASE_URL}${page.path}`;
      console.log(`\n📄 Auditing: ${page.label} (${url})`);

      try {
        const data = await fetchPSI(url, strategy);
        const categories = data.lighthouseResult.categories;

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

        strategyResults.push({ page: page.label, path: page.path, ...scores, passed });

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
        strategyResults.push({ page: page.label, path: page.path, error: err.message, passed: false });
        allPassed = false;
      }

      // Rate limiting: PSI API has quotas, add delay between requests
      if (page !== PAGES[PAGES.length - 1]) {
        console.log('  ⏳ Waiting 15s (rate limit)...');
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }

    allResults[strategy] = strategyResults;

    // Save strategy results
    fs.writeFileSync(
      path.join(reportDir, `results-${strategy}.json`),
      JSON.stringify(strategyResults, null, 2),
      'utf-8'
    );
  }

  // ── Generate Summary ─────────────────────────────────────────
  const summaryMd = generateSummaryMd(allResults);
  fs.writeFileSync(path.join(reportDir, 'summary.md'), summaryMd, 'utf-8');

  fs.writeFileSync(
    path.join(reportDir, 'results.json'),
    JSON.stringify(allResults, null, 2),
    'utf-8'
  );

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

function generateSummaryMd(allResults) {
  const header = `# PageSpeed Insights Report\n\n> Date: ${new Date().toISOString().split('T')[0]}\n> URL: ${BASE_URL}\n> Strategies: ${STRATEGIES.join(', ')}\n\n`;

  let content = '';

  for (const strategy of STRATEGIES) {
    const results = allResults[strategy];
    content += `## ${strategy.charAt(0).toUpperCase() + strategy.slice(1)}\n\n`;
    content += `| Page | Performance | Accessibility | Best Practices | SEO | Status |\n`;
    content += `|------|-------------|---------------|----------------|-----|--------|\n`;

    for (const r of results) {
      if (r.error) {
        content += `| ${r.page} | ❌ Error | - | - | - | ❌ |\n`;
        continue;
      }
      const perf = `${scoreLabel(r.performance)} ${formatScore(r.performance)}`;
      const a11y = `${scoreLabel(r.accessibility)} ${formatScore(r.accessibility)}`;
      const bp = `${scoreLabel(r['best-practices'])} ${formatScore(r['best-practices'])}`;
      const seo = `${scoreLabel(r.seo)} ${formatScore(r.seo)}`;
      const status = r.passed ? '✅' : '❌';
      content += `| ${r.page} | ${perf} | ${a11y} | ${bp} | ${seo} | ${status} |\n`;
    }

    content += '\n';
  }

  content += `## Thresholds\n\n| Category | Minimum |\n|----------|--------|\n| Performance | ${THRESHOLDS.performance} |\n| Accessibility | ${THRESHOLDS.accessibility} |\n| Best Practices | ${THRESHOLDS['best-practices']} |\n| SEO | ${THRESHOLDS.seo} |\n`;

  return header + content;
}

// ── Run ────────────────────────────────────────────────────────
runAudit().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
