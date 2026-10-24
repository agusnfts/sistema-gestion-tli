// Levanta todo el entorno local con un solo comando:
// .env → infraestructura Docker → migraciones → seed de desarrollo → api + web en modo watch.
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (!existsSync('.env')) {
  const key = randomBytes(32).toString('base64');
  const env = readFileSync('.env.example', 'utf8').replace(
    /^MFA_ENCRYPTION_KEY=.*$/m,
    `MFA_ENCRYPTION_KEY=${key}`,
  );
  writeFileSync('.env', env);
  console.log('› .env creado a partir de .env.example');
}

if (!process.argv.includes('--no-infra')) {
  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch {
    console.error(
      '✖ No se encontró Docker o no está corriendo.\n' +
        '  Instalá Docker Desktop (https://www.docker.com/products/docker-desktop/), abrilo y volvé a correr `pnpm dev`.\n' +
        '  Si ya tenés PostgreSQL y Redis por otro lado, usá `pnpm dev -- --no-infra`.',
    );
    process.exit(1);
  }
  console.log('› Levantando PostgreSQL y Redis…');
  run('docker compose -f docker-compose.dev.yml up -d --wait');
}

console.log('› Compilando paquetes compartidos…');
run('pnpm --filter @tli/shared --filter @tli/db run build');

console.log('› Aplicando migraciones y seed de desarrollo…');
run('pnpm db:migrate');
run('pnpm db:seed:dev');

console.log('› Iniciando api (http://localhost:3000) y web (http://localhost:5173)…');
const child = spawn(
  'pnpm',
  [
    '--parallel',
    '--filter',
    '@tli/shared',
    '--filter',
    '@tli/api',
    '--filter',
    '@tli/web',
    'run',
    'dev',
  ],
  { stdio: 'inherit', shell: true },
);
child.on('exit', (code) => process.exit(code ?? 0));
