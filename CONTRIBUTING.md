# Cómo trabajamos en este repositorio

## Quién sube qué

| Integrante | Carpetas | Rama |
|---|---|---|
| Benjamín Muñoz (seguridad, API, bases de datos, despliegue) | `api/`, `bd/`, `herramientas/`, `despliegue/`, `pruebas/` y archivos de la raíz | `benjamin-munoz/<tema>`, por ejemplo `benjamin-munoz/api-y-bases` |
| Martín García (interfaz web) | `web/` | `martin-garcia/<tema>`, por ejemplo `martin-garcia/web` |
| Benjamín Cuevas (Scrum Master) | No sube código: **revisa y aprueba todos los pull requests** | — |

`main` está protegida: no acepta cambios directos, exige un pull request aprobado por el Scrum Master (dueño de todo el código en `.github/CODEOWNERS`) y que las pruebas automáticas estén en verde.

## Pruebas automáticas

Cada parte tiene su propio archivo en `.github/workflows/`, y todos corren en cada pull request:

| Archivo | Qué prueba | Parte |
|---|---|---|
| `secretos.yml` | Contraseñas, tokens o claves en el historial (gitleaks) | Base |
| `api.yml` | API y bases: lint, compilación, unitarias, integración, integridad, npm audit; herramientas del catálogo | Benjamín Muñoz |
| `web.yml` | Las tres apps: lint, compilación, unitarias y navegador | Martín García |
| `despliegue.yml` | El servidor completo con HTTPS, cabeceras y permisos de las bases | Benjamín Muñoz |

## Flujo de una tarea

1. **Partir desde lo último de `main`**:
   ```bash
   git switch main
   git pull
   git switch -c martin-garcia/web
   ```
2. **Trabajar y hacer commits chicos**, uno por cambio que se pueda explicar en una línea, y solo en tus carpetas.
3. **Subir la rama**: `git push -u origin martin-garcia/web`.
4. **Abrir un pull request** hacia `main`, completar la plantilla y pedir revisión a Benjamín Cuevas (Reviewers).
5. **Esperar las pruebas automáticas.** Si alguna falla, se corrige en la misma rama y se vuelve a subir.
6. **Revisión del Scrum Master**: aprueba o pide cambios. Los cambios se suben a la misma rama.
7. **Unir** con «Create a merge commit» (conserva los commits de cada autor) y borrar la rama. Después: `git switch main` y `git pull`.

## Mensajes de commit

Formato: `Área: qué cambia`, en presente y en español.

```
API: agrega reportes de queja o felicitación
Web: pantalla de calificación del pasajero
BD: índice para la consulta de demanda por hora
Pruebas: casos de borde del "me subí" (200 y 201 m)
Docs: paso de instalación de Docker Desktop
Corrige: asientos negativos al cerrar la jornada
```

## Antes de abrir un pull request

- [ ] `npm run lint` y `npm test` sin errores en la carpeta que cambiaste (`api/` o `web/`).
- [ ] El cambio toca solo tus carpetas.
- [ ] Ninguna contraseña, token ni archivo `.env` en el cambio (las pruebas automáticas lo revisan con gitleaks).
- [ ] Si cambia la forma de instalar o ejecutar, actualizar `docs/instalacion.md`.

## Reglas del código

- Nombres en español y con el vocabulario del negocio: jornada, abordaje, aviso de espera, tramo.
- Cada módulo separa controlador (HTTP), servicio (reglas) y repositorio (consultas). Las reglas críticas van en funciones puras (`reglas-*.ts`) con sus propias pruebas.
- Toda regla de negocio se valida en la API, aunque la interfaz también la controle.
- Las consultas a la base siempre van parametrizadas; nunca se arma SQL concatenando texto.
- Los límites tienen nombre (por ejemplo `DISTANCIA_MAXIMA_ABORDAJE_M`) y se definen en un solo lugar.
- Los comentarios explican el porqué de una decisión, no repiten lo que hace el código.
