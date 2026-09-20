#!/usr/bin/env node
// init-project.mjs — Scaffolding script para skeleton_base
// Uso: node scripts/init-project.mjs --name "MiProyecto" --domain saas

import { execSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SKELETON_DIR = resolve(import.meta.dirname, '..');

const VALID_DOMAINS = ['saas', 'ecommerce', 'blog', 'services', 'education'];
const VALID_FEATURES = ['cms', 'push', 'notifications'];
const EXCLUDED_DIRS = ['.git', 'node_modules', '.next', 'production_artifacts', '.engram', 'coverage'];

const USAGE = `Uso: node scripts/init-project.mjs --name <nombre> [opciones]

Opciones:
  --name <string>          Nombre del proyecto (obligatorio, kebab-case o camelCase)
  --domain <pattern>       Dominio: saas | ecommerce | blog | services | education (default: none)
  --lang <code>            Idioma (default: es)
  --timezone <tz>          Timezone IANA (default: UTC)
  --features <list>        CSV de features: cms,push,notifications (default: all)
  --target <path>          Directorio destino (default: ./<name>)
  --from-blueprint <json>  Archivo answers.json del blueprint
  --dry-run                Solo muestra qué haría, sin escribir
  --help                   Muestra este mensaje`;

function log(step, msg) {
  console.log(`  ${step} ${msg}`);
}

function parseArgs(argv) {
  const args = { features: 'all', lang: 'es', timezone: 'UTC', domain: 'none', explicit: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
        args.help = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--name':
        args.name = argv[++i];
        args.explicit.add('name');
        break;
      case '--domain':
        args.domain = argv[++i];
        args.explicit.add('domain');
        break;
      case '--lang':
        args.lang = argv[++i];
        args.explicit.add('lang');
        break;
      case '--timezone':
        args.timezone = argv[++i];
        args.explicit.add('timezone');
        break;
      case '--features':
        args.features = argv[++i];
        args.explicit.add('features');
        break;
      case '--target':
        args.target = argv[++i];
        args.explicit.add('target');
        break;
      case '--from-blueprint':
        args.fromBlueprint = argv[++i];
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`❌ Argumento desconocido: ${arg}\n`);
          console.error(USAGE);
          process.exit(1);
        }
    }
  }
  return args;
}

function validateName(name) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'El nombre es obligatorio y debe ser un string no vacío';
  }
  if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(name)) {
    return 'El nombre solo puede contener letras, números y guiones (kebab-case o camelCase)';
  }
  return null;
}

function loadBlueprint(file) {
  if (!file) return null;
  const raw = readFileSync(resolve(file), 'utf8');
  return JSON.parse(raw);
}

function applyBlueprint(args, blueprint) {
  if (!blueprint) return args;
  const out = { ...args };
  const pick = (key, value) => {
    if (value !== undefined && value !== null && value !== '' && !out.explicit.has(key)) out[key] = value;
  };
  pick('name', blueprint.Q1);
  pick('domain', blueprint.Q3);
  if (blueprint.Q5) {
    pick('lang', blueprint.Q5.lang);
    pick('timezone', blueprint.Q5.timezone);
  }
  if (Array.isArray(blueprint.Q6) && blueprint.Q6.length > 0) pick('features', blueprint.Q6.join(','));
  return out;
}

function toPackageName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function toTitle(name) {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function copySkeleton(target) {
  const entries = readdirSafe(SKELETON_DIR);
  mkdirSync(target, { recursive: true });
  for (const entry of entries) {
    if (EXCLUDED_DIRS.includes(entry)) continue;
    const src = join(SKELETON_DIR, entry);
    const dest = join(target, entry);
    cpSync(src, dest, { recursive: true });
  }
}

function readdirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function patchPackageJson(target, name) {
  const pkgPath = join(target, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = toPackageName(name);
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function patchLayout(target, name, lang) {
  const layoutPath = join(target, 'app', 'layout.tsx');
  if (!existsSync(layoutPath)) return;
  let content = readFileSync(layoutPath, 'utf8');
  const title = toTitle(name);
  content = content.replace(/title:\s*'[^']*'/, `title: '${title}'`);
  content = content.replace(/description:\s*'[^']*'/, `description: '${title} — plataforma construida sobre skeleton_base.'`);
  content = content.replace(/<html lang="[^"]*">/, `<html lang="${lang}">`);
  writeFileSync(layoutPath, content);
}

function patchApiDocs(target, name) {
  const specPath = join(target, 'lib', 'api-docs', 'spec.ts');
  if (!existsSync(specPath)) return;
  let content = readFileSync(specPath, 'utf8');
  content = content.replace(/title:\s*'[^']*'/, `title: '${toTitle(name)} API'`);
  writeFileSync(specPath, content);
}

function generateEnvLocal(target, timezone) {
  const examplePath = join(target, '.env.example');
  const envPath = join(target, '.env.local');
  if (!existsSync(examplePath)) return;
  let content = readFileSync(examplePath, 'utf8');
  content = content.replace(/^APP_TIMEZONE=.*$/m, `APP_TIMEZONE=${timezone}`);
  content = `# Generado por init-project\n${content}`;
  writeFileSync(envPath, content);
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: 'pipe', ...opts }).toString();
  } catch (err) {
    if (opts.graceful) {
      console.warn(`  ⚠️  ${opts.warnMsg || 'Comando falló, continuando...'}`);
      return null;
    }
    throw err;
  }
}

function gitInit(target) {
  run(`git init -q`, { cwd: target });
  run(`git add -A`, { cwd: target });
  run(`git commit -q -m "chore: init desde skeleton_base"`, {
    cwd: target,
    graceful: true,
    warnMsg: 'git commit falló (¿git user configurado?). El proyecto se creó igualmente.',
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  let blueprint = null;
  try {
    blueprint = loadBlueprint(args.fromBlueprint);
  } catch (err) {
    console.error(`❌ No se pudo leer --from-blueprint: ${err.message}`);
    process.exit(1);
  }

  const finalArgs = applyBlueprint(args, blueprint);

  const nameError = validateName(finalArgs.name);
  if (nameError) {
    console.error(`❌ ${nameError}\n`);
    console.error(USAGE);
    process.exit(1);
  }

  if (finalArgs.domain !== 'none' && !VALID_DOMAINS.includes(finalArgs.domain)) {
    console.error(`❌ Dominio inválido: "${finalArgs.domain}". Válidos: ${VALID_DOMAINS.join(', ')}`);
    process.exit(1);
  }

  const features = finalArgs.features === 'all'
    ? VALID_FEATURES
    : finalArgs.features.split(',').map((f) => f.trim()).filter(Boolean);
  for (const f of features) {
    if (!VALID_FEATURES.includes(f)) {
      console.error(`❌ Feature inválida: "${f}". Válidas: ${VALID_FEATURES.join(', ')}`);
      process.exit(1);
    }
  }

  const name = finalArgs.name.trim();
  const target = resolve(finalArgs.target || `./${name}`);

  console.log(`📋 init-project: Creando proyecto "${toTitle(name)}"...`);

  if (existsSync(target) && readdirSafe(target).length > 0) {
    console.error(`❌ Ya existe. Elige otro nombre o --target diferente`);
    process.exit(1);
  }

  if (finalArgs.dryRun) {
    console.log(`  🔍 Dry-run: se copiaría skeleton → ${target}`);
    console.log(`  🔍 Dry-run: package.json name → ${toPackageName(name)}`);
    console.log(`  🔍 Dry-run: layout title → ${toTitle(name)}`);
    console.log(`  🔍 Dry-run: api-docs title → ${toTitle(name)} API`);
    console.log(`  🔍 Dry-run: .env.local (APP_TIMEZONE=${finalArgs.timezone})`);
    console.log(`  🔍 Dry-run: pnpm install + db:migrate + git init`);
    console.log(`  ✅ Dry-run completado. Nada fue escrito.`);
    process.exit(0);
  }

  log('✅', 'Copiando skeleton...');
  copySkeleton(target);

  log('✏️ ', 'Configurando package.json...');
  patchPackageJson(target, name);

  log('✏️ ', 'Configurando layout...');
  patchLayout(target, name, finalArgs.lang);

  log('✏️ ', 'Configurando api-docs...');
  patchApiDocs(target, name);

  log('🔑', 'Generando .env.local...');
  generateEnvLocal(target, finalArgs.timezone);

  log('📦', 'Instalando dependencias...');
  try {
    run('pnpm install', { cwd: target });
  } catch (err) {
    console.error(`❌ pnpm no encontrado. Instalar: corepack enable`);
    process.exit(1);
  }

  log('🗃️ ', 'Migrando base de datos...');
  run('pnpm run db:migrate', {
    cwd: target,
    graceful: true,
    warnMsg: 'DB no disponible (¿DATABASE_URL configurada?). Se continúa sin migrar.',
  });

  log('🔍', 'Verificando...');
  const verify = [
    ['package.json', () => JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).name === toPackageName(name)],
    ['app/layout.tsx', () => readFileSync(join(target, 'app/layout.tsx'), 'utf8').includes(toTitle(name))],
    ['.env.local', () => existsSync(join(target, '.env.local'))],
  ];
  for (const [file, check] of verify) {
    try {
      if (!check()) console.warn(`  ⚠️  Verificación falló para ${file} (se continúa)`);
    } catch {
      console.warn(`  ⚠️  Verificación falló para ${file} (se continúa)`);
    }
  }

  log('🔧', 'Inicializando git...');
  gitInit(target);

  console.log(`  ✅ Proyecto creado en ${target}`);
  console.log(`\n  Siguientes pasos:`);
  console.log(`    cd ${target}`);
  console.log(`    pnpm run dev`);
}

main();