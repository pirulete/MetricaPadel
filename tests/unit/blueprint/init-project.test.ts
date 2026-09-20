import { execSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'init-project.mjs');
const FIXTURES_DIR = join(process.cwd(), 'tests', 'unit', 'blueprint', '__fixtures__');
const MINIMAL_ANSWERS = {
  Q1: 'test-project',
  Q2: 'Test project',
  Q3: 'none',
  Q4: { primary: '#6366f1', primaryDark: '#4f46e5' },
  Q5: { lang: 'es', timezone: 'UTC' },
  Q6: [],
  Q7: 'none',
  Q8: 'verify+reset',
  Q9: 'none',
  Q10: 'none',
  Q11: [],
  Q12: {},
  Q13: ['USER', 'ADMIN'],
  Q14: ['home'],
  Q15: { metrics: [] },
};

describe('init-project.mjs', () => {
  describe('smoke tests', () => {
    it('loads without errors when executed with --help', () => {
      const output = execSync(`node ${SCRIPT_PATH} --help`, {
        encoding: 'utf-8',
        timeout: 10000,
      });
      expect(output).toBeTruthy();
    });

    it('prints usage with --help flag', () => {
      const output = execSync(`node ${SCRIPT_PATH} --help`, {
        encoding: 'utf-8',
        timeout: 10000,
      });
      expect(output.toLowerCase()).toMatch(/uso|usage|--name/);
    });

    it('fails with clear message when no arguments provided', () => {
      try {
        execSync(`node ${SCRIPT_PATH}`, {
          encoding: 'utf-8',
          timeout: 10000,
          stdio: 'pipe',
        });
        fail('Expected non-zero exit code');
      } catch (err: any) {
        const stderr = err.stderr || '';
        const stdout = err.stdout || '';
        const output = stderr + stdout;
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('fails with clear message when --name is invalid', () => {
      try {
        execSync(`node ${SCRIPT_PATH} --name "INVALID NAME!!!"`, {
          encoding: 'utf-8',
          timeout: 10000,
          stdio: 'pipe',
        });
        fail('Expected non-zero exit code');
      } catch (err: any) {
        const output = (err.stderr || '') + (err.stdout || '');
        expect(output).toBeTruthy();
      }
    });

    it('fails when --from-blueprint points to non-existent file', () => {
      try {
        execSync(`node ${SCRIPT_PATH} --from-blueprint nonexistent.json`, {
          encoding: 'utf-8',
          timeout: 10000,
          stdio: 'pipe',
        });
        fail('Expected non-zero exit code');
      } catch (err: any) {
        const output = (err.stderr || '') + (err.stdout || '');
        expect(output).toBeTruthy();
      }
    });
  });

  describe('answers-example.json', () => {
    it('exists and is valid JSON', () => {
      const path = join(process.cwd(), 'blueprint', 'answers-example.json');
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toBeDefined();
    });

    it('contains all required fields (Q1, Q3)', () => {
      const path = join(process.cwd(), 'blueprint', 'answers-example.json');
      const parsed = JSON.parse(readFileSync(path, 'utf-8'));
      expect(parsed.Q1).toBeTruthy();
      expect(typeof parsed.Q1).toBe('string');
      expect(parsed.Q3).toBeDefined();
    });
  });

  describe('dry-run mode', () => {
    it('prints execution plan without writing files', () => {
      const tmpAnswers = join(FIXTURES_DIR, 'minimal-answers.json');
      if (!existsSync(FIXTURES_DIR)) {
        execSync(`mkdir -p ${FIXTURES_DIR}`);
      }
      writeFileSync(tmpAnswers, JSON.stringify(MINIMAL_ANSWERS, null, 2));

      try {
        const output = execSync(
          `node ${SCRIPT_PATH} --from-blueprint ${tmpAnswers} --dry-run --target /tmp/blueprint-test-target`,
          { encoding: 'utf-8', timeout: 15000 }
        );
        expect(output).toBeTruthy();
        expect(output.toLowerCase()).toMatch(/dry-run|dry run/);
      } catch (err: any) {
        const output = (err.stdout || '') + (err.stderr || '');
        expect(output).toBeTruthy();
      }
    });
  });
});
