import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// En desarrollo las variables vienen del .env de la raíz del monorepo.
// En producción las inyecta Docker Compose y este archivo no encuentra ningún .env.
for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}
