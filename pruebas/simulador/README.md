# Simulador de colectivos para la demostración

Sin un colectivo real recorriendo el trazado, el mapa del pasajero queda
vacío y no se puede mostrar lo principal del sistema: **en cuánto llega un
colectivo**. Este simulador mueve colectivos de prueba por el recorrido y
envía sus posiciones a la API real cada 5 segundos, como lo haría la app del
conductor.

**Qué es simulado y qué no.** Solo las posiciones GPS y los asientos libres
de los autos del simulador. Todo lo demás es el sistema publicado: la API
valida esas posiciones igual que las de un teléfono (que estén sobre el
recorrido, a una velocidad creíble y con jornada abierta), calcula la
llegada, recibe los avisos de espera y registra los abordajes.

## Autos y cuentas propias del simulador

El simulador no usa las cuentas de la demo (`conductor1..3`) ni sus autos:
esas quedan libres para mostrar la app del conductor o para las pruebas de
carga. Usa los suyos:

| Qué | Cómo se ve |
|---|---|
| Autos | patente `SIMU01`, `SIMU02`, `SIMU03`, marca y modelo «Auto simulado». El pasajero lee «El SIMU02 viene en camino»: se nota que es simulado. |
| Conductores | `sim9001-1@colectivos.ejemplo.cl`, `sim9001-2@…`, `sim9001-3@…` (nombre «Conductor simulado N (9001)») |

- **Se crean solos** la primera vez que corre, con la cuenta del
  representante del trazado y las mismas rutas que usa el panel (quedan en la
  auditoría). La contraseña es la misma de las cuentas de la demo.
- **Al detenerlo** cierra sus jornadas y deja esos autos y conductores
  **desactivados**: fuera de la simulación no aparecen en el mapa ni en la
  lista de autos de la app del conductor. Al volver a partir los activa.
- En el panel del representante, sección Flota, se ven como cualquier auto
  del trazado (sirve para mostrar en la defensa que son de prueba).

## Encender y apagar (en el servidor)

Por SSH, en el servidor. La contraseña de las cuentas de la demo se escribe
sin que se vea y queda solo en esa ventana:

```bash
cd ~/colectivos-proyecto-integrado/despliegue
read -rsp "Clave de las cuentas de prueba: " CLAVE_DEMO; export CLAVE_DEMO; echo
docker compose --profile demo up -d simulador
docker compose logs -f simulador        # Ctrl+C deja de mirar; el simulador sigue
```

Para apagarlo (cierra las jornadas y desactiva sus autos; tarda unos
segundos) y borrar el contenedor, que guarda la contraseña mientras exista:

```bash
docker compose --profile demo stop simulador && docker compose --profile demo rm -f simulador
```

Si nadie lo apaga, termina solo a las 4 horas.

Opciones (se escriben antes de `docker compose`, en la misma línea):

| Variable | Por defecto | Para qué |
|---|---|---|
| `SIMULADOR_AUTOS` | `3` | Cuántos autos (1 a 3) |
| `SIMULADOR_TRAZADO` | `9001` | Otro trazado, por ejemplo una línea del catálogo creada para la demo |
| `SIMULADOR_REPRESENTANTE` | `representante@colectivos.ejemplo.cl` | El representante de ese trazado |
| `SIMULADOR_DURACION_MIN` | `240` | Minutos antes de terminar solo |

Ejemplo: `SIMULADOR_AUTOS=2 docker compose --profile demo up -d simulador`.

## Qué dicen los registros

```
Trazado 9001: Hospital Sotero del Rio 3.7 km / Plaza Puente Alto 3.7 km
SIMU02 (sim9001-2@colectivos.ejemplo.cl) parte hacia Hospital Sotero del Rio con 4 asientos libres
SIMU02 ve 1 persona(s) esperando adelante (la mas cercana a 640 m)
SIMU02 se detiene 25 s a recoger a 1 persona(s): ya pueden marcar «Me subi»
SIMU01 llega al terminal (Hospital Sotero del Rio); espera 60 s
Autos SIMU01, SIMU02, SIMU03 y sus conductores quedan desactivados hasta la proxima simulacion
```

| Mensaje | Qué hacer |
|---|---|
| `No se pudo iniciar sesion con representante@… (401)` | La contraseña está mal. Apagar y volver a escribirla con cuidado: con 5 intentos fallidos la cuenta se bloquea. |
| `la API rechaza el salto desde su posicion anterior; espera 60 s` | Normal si se reinició hace menos de un minuto: el auto quedó en otro punto. Sigue solo. |
| `SIMU01 no esta libre` | Alguien abrió una jornada con ese auto desde la app del conductor. Cerrarla y volver a partir. |
| Autos `SIMU` siguen visibles con el simulador apagado | Se cortó sin apagarse bien (por ejemplo, se reinició el servidor). Encenderlo y apagarlo de nuevo, o desactivarlos en el panel, sección Flota. |

## Ver llegar el colectivo desde la sala

La app del pasajero usa la ubicación del teléfono, y la API solo acepta un
aviso de espera («Estoy esperando») a menos de 200 m del recorrido. Desde
la sala de clases eso no se cumple, así que la ubicación del pasajero
también se simula. Las cuentas de la demo (`@colectivos.ejemplo.cl`) tienen
la opción en la misma app, en cualquier navegador o celular:

1. Iniciar sesión como pasajero (por ejemplo `pasajero1`).
2. Menú (las iniciales, arriba a la derecha) → **Simular mi ubicación
   (demostración)**. Deja a la persona en la mitad del recorrido del sentido
   elegido, y el mapa muestra «Ubicación simulada (demostración)» mientras
   está activa. La **X** de ese aviso vuelve a la ubicación real.

Otra forma, solo en Chrome: `F12` → menú `⋮` → **More tools** → **Sensors** →
**Location** → **Other…**, latitud `-33.5931` y longitud `-70.5790`.

Los 3 autos parten repartidos en la vuelta completa (dos de ida y uno de
vuelta), así que siempre hay colectivos en los dos sentidos y el próximo pasa
por la mitad del recorrido en pocos minutos.

## Guion para la defensa (unos 4 minutos)

1. Panel del representante, Flota: los autos `SIMU` y por qué existen (no
   hay un colectivo real en ruta durante la presentación).
2. App del pasajero: el mapa con los colectivos moviéndose, «¿Qué colectivo
   me sirve?», y el tiempo de llegada del próximo.
3. «Estoy esperando». En los registros del simulador se ve que el colectivo
   que viene detecta a la persona esperando adelante.
4. El colectivo se detiene en el punto: «Me subí». Luego «Ya bajé» y la
   calificación del viaje.
5. Cerrar con lo que falta: la prueba de campo con un colectivo real.

Si el servidor o la red de la sala fallan, se muestra el video de respaldo
grabado con este mismo guion.

## Declaración para el informe y la presentación

> Para las demostraciones, las posiciones de los colectivos SIMU01 a SIMU03
> las genera un simulador (`pruebas/simulador`) que recorre el trazado a unos
> 25 km/h y las envía a la API publicada cada 5 segundos, con cuentas de
> conductor creadas solo para eso. La ubicación del pasajero en la sala se
> fija con la herramienta Sensors de Chrome. La validación de las posiciones,
> el cálculo del tiempo de llegada, los avisos de espera y los abordajes son
> los del sistema real. El sistema no se ha probado con un colectivo real en
> ruta: esa prueba de campo queda para el piloto.

## Correrlo desde un computador (sin SSH)

Con Node 24, en la carpeta del repositorio, en Git Bash:

```bash
read -rsp "Clave de las cuentas de prueba: " CLAVE_DEMO; export CLAVE_DEMO; echo
BASE_URL="https://colectivos-inacap.chilecentral.cloudapp.azure.com" AUTOS=2 node pruebas/simulador/simular-colectivos.mjs
```

`Ctrl+C` lo detiene (cierra las jornadas y desactiva los autos). Desde un
computador las peticiones salen con la IP de esa casa, que la API limita a
100 por minuto junto con el navegador: por eso 2 autos y no 3.

## Pruebas

```bash
node --test pruebas/simulador/simulador.test.mjs
```

Prueban los cálculos (reparto en ida y vuelta, interpolación del recorrido, velocidad bajo el máximo
de la API, cuándo detenerse por un aviso, patentes y correos propios). En
GitHub corren con cada pull request, y el flujo de despliegue además ejecuta
el simulador 30 segundos contra el sistema completo y comprueba que crea sus
autos y los deja desactivados.
