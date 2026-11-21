#!/usr/bin/env bash
# Revision de seguridad del servidor publicado (caja negra, sin credenciales).
# Comprueba desde afuera lo que el analisis STRIDE de la EVA 2 exige al
# servidor: HTTPS obligatorio, encabezados de seguridad, TLS moderno, rutas
# de la API cerradas sin sesion y archivos internos que no se ven.
#
# Uso:   bash pruebas/seguridad/revisar-servidor.sh colectivos-inacap.chilecentral.cloudapp.azure.com
# Salida: una linea por comprobacion (OK / FALLA) y el total. Termina con
#         codigo 1 si alguna falla, para poder usarlo en un script.
# Necesita: bash, curl y openssl (vienen con Git Bash en Windows).
set -uo pipefail

DOMINIO="${1:?Indica el dominio, por ejemplo colectivos-inacap.chilecentral.cloudapp.azure.com}"
BASE="https://${DOMINIO}"
ok=0
fallas=0

# comprobar ID "descripcion" comando...   (OK si el comando termina bien)
comprobar() {
  local id=$1 descripcion=$2
  shift 2
  if "$@"; then
    printf 'OK     %-7s %s\n' "$id" "$descripcion"
    ok=$((ok + 1))
  else
    printf 'FALLA  %-7s %s\n' "$id" "$descripcion"
    fallas=$((fallas + 1))
  fi
}

contiene() { [[ "$1" == *"$2"* ]]; }
no_contiene() { [[ "$1" != *"$2"* ]]; }
iguales() { [ "$1" = "$2" ]; }
vacio() { [ -z "$1" ]; }
tls_acepta() { echo | openssl s_client -connect "${DOMINIO}:443" -servername "$DOMINIO" "$1" > /dev/null 2>&1; }
tls_rechaza() { ! tls_acepta "$1"; }
estado() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }

encabezados=$(curl -sS -D - -o /dev/null "$BASE/" | tr -d '\r')
encabezado() { printf '%s\n' "$encabezados" | grep -i "^$1:" | head -n1 | cut -d' ' -f2-; }

# --- Transporte -------------------------------------------------------
redireccion=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "http://${DOMINIO}/")
comprobar S-01 "HTTP redirige a HTTPS ($redireccion)" contiene "$redireccion" " https://${DOMINIO}/"

hsts=$(encabezado 'strict-transport-security')
edad=$(printf '%s' "$hsts" | sed -n 's/.*max-age=\([0-9]*\).*/\1/p')
comprobar S-02 "HSTS de un ano o mas (${hsts:-sin encabezado})" test "${edad:-0}" -ge 31536000
comprobar S-03 "TLS 1.1 rechazado" tls_rechaza -tls1_1
comprobar S-04 "TLS 1.2 aceptado" tls_acepta -tls1_2

certificado=$(echo | openssl s_client -connect "${DOMINIO}:443" -servername "$DOMINIO" 2> /dev/null)
vence=$(printf '%s' "$certificado" | openssl x509 -noout -enddate 2> /dev/null | cut -d= -f2)
emisor=$(printf '%s' "$certificado" | openssl x509 -noout -issuer 2> /dev/null)
comprobar S-05 "Certificado valido y de confianza (vence: ${vence:-?}; ${emisor:-?})" curl -sS -o /dev/null "$BASE/"

# --- Encabezados de seguridad -----------------------------------------
csp=$(encabezado 'content-security-policy')
csp_estricta() {
  contiene "$csp" "default-src 'self'" && contiene "$csp" "script-src 'self'" &&
    contiene "$csp" "frame-ancestors 'none'" && no_contiene "$csp" "unsafe-inline" && no_contiene "$csp" "unsafe-eval"
}
comprobar S-06 "CSP sin scripts en linea ni de terceros" csp_estricta
comprobar S-07 "X-Content-Type-Options: nosniff" iguales "$(encabezado 'x-content-type-options')" nosniff
comprobar S-08 "X-Frame-Options: DENY (no se puede incrustar en otro sitio)" iguales "$(encabezado 'x-frame-options')" DENY
comprobar S-09 "Referrer-Policy presente ($(encabezado 'referrer-policy'))" test -n "$(encabezado 'referrer-policy')"
comprobar S-10 "Permissions-Policy: sin camara ni microfono" contiene "$(encabezado 'permissions-policy')" "camera=()"
comprobar S-11 "No revela el software del servidor (Server / X-Powered-By)" vacio "$(encabezado 'server')$(encabezado 'x-powered-by')"
robots=$(curl -sS -D - -o /dev/null "$BASE/panel/" | tr -d '\r' | grep -i '^x-robots-tag:')
comprobar S-12 "El panel no aparece en buscadores (X-Robots-Tag: noindex)" contiene "$robots" noindex

# --- API: control de acceso -------------------------------------------
comprobar S-13 "La API responde (GET /api/salud = 200)" iguales "$(estado "$BASE/api/salud")" 200

for ruta in /api/trazados /api/usuarios/yo /api/auditoria /api/administracion/trazados /api/trazados/mios; do
  codigo=$(estado "$BASE$ruta")
  comprobar S-14 "Sin sesion, $ruta responde 401 (obtenido $codigo)" iguales "$codigo" 401
done

codigo=$(estado -H 'Authorization: Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' "$BASE/api/trazados")
comprobar S-15 "Un token falso (alg none) se rechaza (obtenido $codigo)" iguales "$codigo" 401

# Una cuenta que no existe y una de prueba que si existe, ambas con una clave
# equivocada: la respuesta tiene que ser identica. Usa pasajero3 (y un solo
# intento) para no acercarse al bloqueo de 5 intentos de las cuentas de la demo.
intento() {
  curl -sS -w ' %{http_code}' -H 'Content-Type: application/json' \
    -d "{\"correo_electronico\":\"$1\",\"contrasena\":\"no-es-la-clave-123\"}" "$BASE/api/autenticacion/inicio-sesion"
}
inexistente=$(intento nadie@colectivos.ejemplo.cl)
existente=$(intento pasajero3@colectivos.ejemplo.cl)
misma_respuesta() { contiene "$inexistente" " 401" && iguales "$inexistente" "$existente"; }
comprobar S-16 "Clave equivocada: misma respuesta 401 exista o no la cuenta" misma_respuesta

grande=$(head -c 20000 /dev/zero | tr '\0' 'a')
codigo=$(curl -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  --data "{\"correo_electronico\":\"$grande\",\"contrasena\":\"x\"}" "$BASE/api/autenticacion/inicio-sesion")
comprobar S-17 "Cuerpo de mas de 16 kB rechazado (obtenido $codigo)" iguales "$codigo" 413

cors=$(curl -sS -D - -o /dev/null -H 'Origin: https://sitio-ajeno.example' "$BASE/api/salud" | tr -d '\r' | grep -i '^access-control-allow-origin:')
comprobar S-18 "Otro sitio no puede leer la API desde el navegador (sin CORS abierto)" vacio "$cors"

# --- Archivos internos ------------------------------------------------
sin_secretos() { ! curl -sS "$BASE$1" | grep -q -E 'SECRETO_JWT|CONTRASENA|\[core\]|"dependencies"'; }
for ruta in /.env /api/.env /.git/config /despliegue/.env /package.json; do
  comprobar S-19 "$ruta no expone secretos ni codigo" sin_secretos "$ruta"
done

echo
echo "Resultado: $ok comprobaciones OK, $fallas con falla ($(date '+%d-%m-%Y %H:%M'))."
[ "$fallas" -eq 0 ]
