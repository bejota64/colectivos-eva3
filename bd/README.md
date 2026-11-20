# Bases de datos

**Responsable:** Benjamín Muñoz. Revisa: Benjamín Cuevas.

| Carpeta | Contenido |
|---|---|
| `postgres/inicio/` | Se ejecutan en orden la primera vez que se crea la base: `01` esquema (15 tablas), `02` datos de prueba ficticios (trazado 9001), `03` cuenta de la API con permisos mínimos, `04` a `06` catálogo de recorridos reales, `07` funciones con las que el administrador crea trazados y representantes desde el panel |
| `postgres/pruebas_integridad.sql` | Comprueba restricciones CHECK, UNIQUE y claves foráneas, y que la cuenta de la API no pueda crear un administrador |
| `postgres/administracion/` | Scripts de consola con la cuenta dueña: alta de un trazado que no está en el catálogo y desactivación de cuentas |
| `mongo/` | Colecciones con validadores, índices con caducidad y cuenta de la API |

El catálogo se explica en [`docs/catalogo-recorridos.md`](../docs/catalogo-recorridos.md).
