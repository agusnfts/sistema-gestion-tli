# Despliegue en producción

Stack: Docker Compose en un VPS (4 vCPU / 8 GB RAM / 100 GB SSD, [ADR 0012](adr/0012-infrastructure-sizing.md)).
Todo lo de producción está en [`deploy/`](../deploy): `compose.yml`, `Caddyfile`, plantilla de variables y scripts de backup.

```
Internet ──443──► caddy ──► api ──┬── postgres
                   (SPA)          ├── redis ◄── worker (OCR, antivirus, mails, SLA)
                                  └── clamav
```

Solo Caddy publica puertos (80/443, con TLS automático de Let's Encrypt). La base, Redis y ClamAV quedan en una red interna. Los contenedores corren sin root, sin privilegios extra, con límite de memoria y (api y worker) con el sistema de archivos de solo lectura.

## Pendiente de definir

- **Dominio** (`DOMAIN`): por ejemplo `tli.tml.com.ar`, con un registro DNS A/AAAA apuntando al VPS.
- **Ubicación del VPS**: si queda fuera de Argentina, es transferencia internacional de datos personales. Ver [registro de tratamiento](data-processing-register.md#transferencias-internacionales) (preferir un país con nivel adecuado según la AAIP, o cláusulas contractuales con el proveedor).
- **Destino de los backups fuera del VPS** (otro proveedor u otra región): S3 compatible, Google Drive de la empresa, etc.

## 1. Preparar el servidor (una vez)

Debian 12 o Ubuntu 24.04 LTS.

```bash
# Usuario de administración con sudo y acceso solo por clave SSH
adduser tliadmin && usermod -aG sudo tliadmin
# (copiar la clave pública a /home/tliadmin/.ssh/authorized_keys)

# SSH: sin root, sin contraseñas
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Firewall: solo SSH, HTTP y HTTPS
sudo apt install -y ufw fail2ban unattended-upgrades
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable

# Actualizaciones de seguridad automáticas
sudo dpkg-reconfigure -plow unattended-upgrades

# Docker (repositorio oficial)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker tliadmin
```

> Docker publica puertos por fuera de ufw: por eso en `compose.yml` solo Caddy tiene `ports`. No agregar `ports` a otros servicios.

Opcional y recomendado: hora sincronizada (`timedatectl set-ntp true`), zona horaria `America/Argentina/Buenos_Aires`, y swap de 2 GB para picos de OCR.

## 2. Instalar el sistema

```bash
git clone <repo> /opt/tli && cd /opt/tli/deploy
cp .env.prod.example .env && chmod 600 .env
# Completar .env: DOMAIN, ACME_EMAIL, contraseñas (openssl rand -base64 32),
# MFA_ENCRYPTION_KEY (32 bytes base64) y BACKUP_AGE_RECIPIENT (ver Backups).
docker compose up -d --build
docker compose ps        # todos "healthy"; ClamAV tarda ~10 min la primera vez (firmas)
```

El servicio `migrate` aplica las migraciones y el seed base (permisos, roles, catálogos) cada vez que se levanta el stack; es idempotente.

**Primer Admin** (imprime una contraseña temporal; al entrar pide cambiarla y configurar MFA):

```bash
docker compose run --rm --entrypoint node -w /app/packages/db api \
  dist/seed/create-admin.js --email nombre@tml.com.ar --name "Nombre Apellido"
```

Crear **al menos dos Admins**: si uno pierde el autenticador, el otro le resetea el MFA.

**Recuperar el acceso** del único Admin (si perdió autenticador y códigos):

```bash
docker compose run --rm --entrypoint node -w /app/packages/db api \
  dist/seed/recover-access.js --email nombre@tml.com.ar
```

## 3. Backups cifrados

Se respalda la base (`pg_dump`) y los archivos (adjuntos y documentos). Se cifran con [age](https://age-encryption.org) usando una **clave pública**: el servidor puede cifrar pero no descifrar. La clave privada se guarda **fuera** del VPS (gestor de contraseñas del área y una copia impresa en sobre cerrado). Sin ella no se puede restaurar.

**Generar el par de claves** (en una PC, no en el servidor):

```bash
docker run --rm --entrypoint age-keygen tli/backup:latest   # o, con age instalado: age-keygen -o clave-backup.txt
# "# public key: age1..." → BACKUP_AGE_RECIPIENT en deploy/.env
# La línea AGE-SECRET-KEY-... es la clave privada: guardarla en el gestor de contraseñas.
```

**Backup diario** (cron del usuario `tliadmin`, 3:15 AM):

```cron
15 3 * * * cd /opt/tli/deploy && docker compose --profile backup run --rm backup >> /var/log/tli-backup.log 2>&1
```

Quedan en `BACKUP_DIR` (`tli-FECHA.db.age`, `tli-FECHA.files.age`, `tli-FECHA.sha256`) y se borran los de más de `BACKUP_KEEP_DAYS` días. **Copiarlos fuera del VPS** (por ejemplo con `rclone sync /var/backups/tli remoto:tli-backups` en el mismo cron).

### Simulacro de restauración (mensual)

Restaura en una base descartable, verifica la cadena de auditoría y que los archivos se puedan leer. No toca producción.

```bash
cd /opt/tli/deploy
./restore-drill.sh tli-20261101T061500Z /ruta/segura/clave-backup.txt
# ✔ Simulacro OK: el backup … se puede restaurar.
```

Anotar fecha y resultado en el registro de simulacros (planilla del área).

### Restaurar (desastre)

```bash
cd /opt/tli/deploy
docker compose stop api worker caddy
BACKUP_KEY_FILE=/ruta/segura/clave-backup.txt \
  docker compose --profile restore run --rm restore tli-FECHA
docker compose up -d
```

Después: verificar la auditoría (Administración → Auditoría → Verificar integridad) y avisar a los usuarios. Borrar la clave privada del servidor.

## 4. Actualizar

```bash
cd /opt/tli && git pull
cd deploy && docker compose up -d --build     # migraciones automáticas antes de la api
docker image prune -f
```

Antes de actualizar: backup manual (`docker compose --profile backup run --rm backup`).
Fijar las imágenes base por digest (`node:22-bookworm-slim@sha256:…`, `caddy:2-alpine@sha256:…`, `postgres:16-alpine@sha256:…`) y actualizarlas a propósito, no por accidente.

## 5. Monitoreo mínimo

- `docker compose ps`: estado y healthchecks. Healthcheck de la API: `https://DOMAIN/api/health`.
- Un monitor externo gratuito (UptimeRobot, Better Stack) contra `/api/health` con aviso por mail.
- Logs: `docker compose logs -f api worker` (JSON, sin cookies ni tokens; rotan a 5×10 MB por contenedor).
- Espacio en disco: alerta al 80 % (los adjuntos y documentos crecen).

## Variables de producción

Ver [`deploy/.env.prod.example`](../deploy/.env.prod.example). Las fija `compose.yml`: `NODE_ENV=production`, `COOKIE_SECURE=true` (cookie `__Host-`, HSTS), `TRUST_PROXY=1`, `CLAMAV_DRIVER=clamd`. La API se niega a arrancar en producción con el antivirus de prueba.
