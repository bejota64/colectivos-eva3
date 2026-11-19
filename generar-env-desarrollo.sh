#!/usr/bin/env bash
# Crea .env y api/.env para el entorno de desarrollo, con contrasenas y
# secreto aleatorios, y las mismas contrasenas en los dos archivos.
# Uso, desde la carpeta del proyecto en Git Bash:
#   bash generar-env-desarrollo.sh               (no toca .env existentes)
#   bash generar-env-desarrollo.sh --reemplazar  (guarda los anteriores como .env.anterior)
# Si ya habias levantado las bases con otras contrasenas, despues de
# reemplazar hay que recrearlas: docker compose down -v && docker compose up -d
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ] || [ -f api/.env ]; then
  if [ "${1:-}" != "--reemplazar" ]; then
    echo "Ya existe .env o api/.env y no se modifican."
    echo "Para crearlos de nuevo: bash generar-env-desarrollo.sh --reemplazar"
    exit 1
  fi
  if [ -f .env ]; then mv .env .env.anterior; fi
  if [ -f api/.env ]; then mv api/.env api/.env.anterior; fi
fi

aleatorio() { node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"; }

umask 077
cp .env.ejemplo .env
cp api/.env.ejemplo api/.env

# Cada marcador aparece una vez en cada archivo: la misma contrasena queda
# en la cuenta de docker-compose y en la URL que usa la API o las pruebas.
for marcador in una-contrasena-larga otra-contrasena-larga una-tercera-contrasena-larga una-cuarta-contrasena-larga; do
  clave=$(aleatorio 18)
  sed -i "s/cambiar-por-$marcador/$clave/" .env api/.env
done
sed -i "s/^SECRETO_JWT=.*/SECRETO_JWT=$(aleatorio 48)/" api/.env

if grep -q "cambiar-por\|reemplazar-por" .env api/.env; then
  echo "Quedo un valor de ejemplo sin reemplazar: revisa .env y api/.env"
  exit 1
fi
echo "Listo: .env y api/.env creados, con las mismas contrasenas en los dos."
