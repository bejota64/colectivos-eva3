import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BaseDatosServicio } from '../src/comun/base-datos/base-datos.servicio';
import { configurarAplicacion } from '../src/configurar-aplicacion';
import { type ConexionesAdmin, conectarComoAdmin } from './datos/admin';

/**
 * CU-13 Administracion desde el panel (Evaluacion 3, desarrollo nuevo): el
 * administrador crea trazados a partir del catalogo oficial y cuentas de
 * representante, y los activa o desactiva, sin entrar al servidor.
 *
 * Tambien comprueba la defensa en la base (07_administracion.sql): aunque
 * alguien usara la cuenta de la API directamente, no podria crear un
 * administrador.
 *
 * Solo datos ficticios; lo que crean lo borran al final.
 */

const CLAVE = 'Clave.Prueba.2026';
const CLAVE_REPRESENTANTE = 'trompo-nube-cerro-lila';
const PREFIJO = 'prueba-e2e-administracion-';
const CODIGO = 'E2E-ADM';
const TRAZADO_9001 = '00000000-0000-4000-8000-000000000100';
const REPRESENTANTE_9001 = '00000000-0000-4000-8000-000000000002';
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000999';

interface TrazadoPanel {
  id: string;
  codigo: string;
  nombre: string;
  comuna: string;
  activo: boolean;
  representante: { id: string; nombre_completo: string; activo: boolean };
  sentidos: { sentido: 'ida' | 'vuelta'; origen: string; destino: string }[];
  vehiculos: number;
  conductores: number;
  en_servicio: number;
}

describe('CU-13 Administracion de trazados y representantes', () => {
  let app: INestApplication;
  let servidor: Parameters<typeof request>[0];
  let admin: ConexionesAdmin;
  let administrador: string;
  let representante: string;
  let pasajero: string;
  /** Linea del catalogo con su recorrido dibujado en ambos sentidos, y una sin dibujo. */
  let lineaDibujada: { id: number; origen: string; destino: string };
  let lineaSinDibujo: number;
  const nuevo = { representanteId: '', correo: '', trazadoId: '' };

  const iniciarSesion = (correo: string, contrasena = CLAVE) =>
    request(servidor).post('/api/autenticacion/inicio-sesion').send({ correo_electronico: correo, contrasena });

  const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** La auditoria se escribe sin bloquear la respuesta: espera hasta 2 s. */
  const eventoDe = async (filtro: Record<string, unknown>) => {
    for (let intento = 0; intento < 20; intento++) {
      const evento = await admin.mongo.collection('registro_eventos').findOne(filtro);
      if (evento) return evento;
      await new Promise((listo) => setTimeout(listo, 100));
    }
    return null;
  };

  const nuevoTrazado = (cambios: Record<string, unknown> = {}) => ({
    codigo: CODIGO,
    nombre: 'Linea de prueba del panel',
    comuna: 'Puente Alto',
    representante_id: nuevo.representanteId,
    linea_catalogo_id: lineaDibujada.id,
    origen: 'Plaza de Puente Alto',
    destino: 'Estacion Las Mercedes',
    ...cambios,
  });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarAplicacion(app as NestExpressApplication);
    await app.init();
    servidor = app.getHttpServer() as Parameters<typeof request>[0];
    admin = await conectarComoAdmin(app);
    administrador = ((await iniciarSesion('admin@colectivos.ejemplo.cl')).body as { token_acceso: string })
      .token_acceso;
    representante = ((await iniciarSesion('representante@colectivos.ejemplo.cl')).body as { token_acceso: string })
      .token_acceso;
    pasajero = ((await iniciarSesion('pasajero1@colectivos.ejemplo.cl')).body as { token_acceso: string })
      .token_acceso;

    const { rows: dibujadas } = await admin.pg.query<{ id: number; origen: string; destino: string }>(
      `SELECT l.id, l.origen, l.destino FROM catalogo_lineas l
        WHERE (SELECT count(*) FROM catalogo_puntos p WHERE p.linea_id = l.id AND p.sentido = 'ida') >= 2
          AND (SELECT count(*) FROM catalogo_puntos p WHERE p.linea_id = l.id AND p.sentido = 'vuelta') >= 2
        ORDER BY l.id LIMIT 1`,
    );
    lineaDibujada = dibujadas[0];
    const { rows: sinDibujo } = await admin.pg.query<{ id: number }>(
      `SELECT l.id FROM catalogo_lineas l
        WHERE NOT EXISTS (SELECT 1 FROM catalogo_puntos p WHERE p.linea_id = l.id) ORDER BY l.id LIMIT 1`,
    );
    lineaSinDibujo = sinDibujo[0].id;
  });

  afterAll(async () => {
    await admin.pg.query(
      `DELETE FROM sentidos WHERE trazado_id IN (SELECT id FROM trazados WHERE codigo = $1)`,
      [CODIGO],
    );
    await admin.pg.query(`DELETE FROM trazados WHERE codigo = $1`, [CODIGO]);
    // Por si una prueba falla a medias: el trazado de los datos de prueba queda como estaba.
    await admin.pg.query(`UPDATE trazados SET activo = true, representante_id = $2 WHERE id = $1`, [
      TRAZADO_9001,
      REPRESENTANTE_9001,
    ]);
    await admin.pg.query(`DELETE FROM usuarios WHERE correo_electronico LIKE $1`, [`${PREFIJO}%`]);
    await admin.cerrar();
    await app.close();
  });

  describe('solo el administrador entra', () => {
    it('sin sesion responde 401', async () => {
      await request(servidor).get('/api/administracion/trazados').expect(401);
    });

    it('un representante o un pasajero reciben 403', async () => {
      await request(servidor).get('/api/administracion/trazados').set(conToken(representante)).expect(403);
      await request(servidor).get('/api/administracion/representantes').set(conToken(pasajero)).expect(403);
      await request(servidor)
        .post('/api/administracion/representantes')
        .set(conToken(representante))
        .send({ nombre_completo: 'Intruso', correo_electronico: `${PREFIJO}intruso@ejemplo.cl`, contrasena: CLAVE_REPRESENTANTE })
        .expect(403);
    });

    it('el administrador ve los trazados con su representante, sentidos y flota', async () => {
      const r = await request(servidor).get('/api/administracion/trazados').set(conToken(administrador)).expect(200);
      const trazado = (r.body as TrazadoPanel[]).find((t) => t.id === TRAZADO_9001);
      expect(trazado).toMatchObject({
        codigo: '9001',
        activo: true,
        representante: { id: REPRESENTANTE_9001, activo: true },
      });
      expect(trazado?.sentidos.map((s) => s.sentido)).toEqual(['ida', 'vuelta']);
      expect(trazado?.vehiculos).toBeGreaterThan(0);
    });
  });

  describe('representantes', () => {
    it('una contrasena de menos de 15 caracteres responde 400', async () => {
      await request(servidor)
        .post('/api/administracion/representantes')
        .set(conToken(administrador))
        .send({ nombre_completo: 'Corta', correo_electronico: `${PREFIJO}corta@ejemplo.cl`, contrasena: 'corta-2026' })
        .expect(400);
    });

    it('el formulario no puede elegir el rol: un campo "rol" responde 400', async () => {
      await request(servidor)
        .post('/api/administracion/representantes')
        .set(conToken(administrador))
        .send({
          nombre_completo: 'Quiere ser admin',
          correo_electronico: `${PREFIJO}rol@ejemplo.cl`,
          contrasena: CLAVE_REPRESENTANTE,
          rol: 'administrador',
        })
        .expect(400);
    });

    it('crea la cuenta como representante, queda en la auditoria sin la contrasena y puede iniciar sesion', async () => {
      nuevo.correo = `${PREFIJO}${Date.now()}@ejemplo.cl`;
      const r = await request(servidor)
        .post('/api/administracion/representantes')
        .set(conToken(administrador))
        .send({ nombre_completo: 'Representante Nueva', correo_electronico: nuevo.correo, contrasena: CLAVE_REPRESENTANTE })
        .expect(201);
      nuevo.representanteId = (r.body as { id: string }).id;
      expect(JSON.stringify(r.body)).not.toContain(CLAVE_REPRESENTANTE);

      const { rows } = await admin.pg.query<{ rol: string; activo: boolean }>(
        `SELECT rol, activo FROM usuarios WHERE id = $1`,
        [nuevo.representanteId],
      );
      expect(rows[0]).toEqual({ rol: 'representante', activo: true });

      const evento = await eventoDe({
        tipo: 'cambio_datos_maestros',
        'detalle.representante_id': nuevo.representanteId,
        'detalle.accion': 'crear',
      });
      expect(evento).not.toBeNull();
      expect(JSON.stringify(evento)).not.toContain(CLAVE_REPRESENTANTE);

      const sesion = await iniciarSesion(nuevo.correo, CLAVE_REPRESENTANTE).expect(200);
      expect((sesion.body as { usuario: { rol: string } }).usuario.rol).toBe('representante');
    });

    it('un correo que ya tiene cuenta responde 409', async () => {
      await request(servidor)
        .post('/api/administracion/representantes')
        .set(conToken(administrador))
        .send({ nombre_completo: 'Repetida', correo_electronico: nuevo.correo, contrasena: CLAVE_REPRESENTANTE })
        .expect(409);
    });
  });

  describe('trazados desde el catalogo oficial', () => {
    it('crea el trazado con el recorrido real de ida y vuelta copiado del catalogo', async () => {
      const r = await request(servidor)
        .post('/api/administracion/trazados')
        .set(conToken(administrador))
        .send(nuevoTrazado({ codigo: 'e2e-adm' }))
        .expect(201);
      const creado = r.body as TrazadoPanel;
      nuevo.trazadoId = creado.id;
      expect(creado).toMatchObject({
        codigo: CODIGO,
        activo: true,
        representante: { id: nuevo.representanteId },
        vehiculos: 0,
        en_servicio: 0,
      });
      expect(creado.sentidos).toEqual([
        { sentido: 'ida', origen: 'Plaza de Puente Alto', destino: 'Estacion Las Mercedes' },
        { sentido: 'vuelta', origen: 'Estacion Las Mercedes', destino: 'Plaza de Puente Alto' },
      ]);

      const { rows } = await admin.pg.query<{ sentido: string; copiados: number; catalogo: number }>(
        `SELECT s.sentido,
                (SELECT count(*)::int FROM puntos_ruta pr WHERE pr.sentido_id = s.id) AS copiados,
                (SELECT count(*)::int FROM catalogo_puntos cp WHERE cp.linea_id = $2 AND cp.sentido = s.sentido) AS catalogo
           FROM sentidos s WHERE s.trazado_id = $1 ORDER BY s.sentido`,
        [nuevo.trazadoId, lineaDibujada.id],
      );
      expect(rows).toHaveLength(2);
      for (const fila of rows) {
        expect(fila.copiados).toBeGreaterThanOrEqual(2);
        expect(fila.copiados).toBe(fila.catalogo);
      }

      expect(
        await eventoDe({ tipo: 'cambio_datos_maestros', 'detalle.trazado_id': nuevo.trazadoId, 'detalle.accion': 'crear' }),
      ).not.toBeNull();
    });

    it('el pasajero ya lo ve entre los trazados activos y su representante lo ve como suyo', async () => {
      const activos = await request(servidor).get('/api/trazados').set(conToken(pasajero)).expect(200);
      expect((activos.body as { id: string }[]).map((t) => t.id)).toContain(nuevo.trazadoId);

      const sesion = await iniciarSesion(nuevo.correo, CLAVE_REPRESENTANTE);
      const token = (sesion.body as { token_acceso: string }).token_acceso;
      const mios = await request(servidor).get('/api/trazados/mios').set(conToken(token)).expect(200);
      expect((mios.body as { id: string }[]).map((t) => t.id)).toEqual([nuevo.trazadoId]);
    });

    it('un codigo repetido responde 409', async () => {
      await request(servidor)
        .post('/api/administracion/trazados')
        .set(conToken(administrador))
        .send(nuevoTrazado())
        .expect(409);
    });

    it('una linea del catalogo sin recorrido dibujado responde 400 con el motivo', async () => {
      const r = await request(servidor)
        .post('/api/administracion/trazados')
        .set(conToken(administrador))
        .send(nuevoTrazado({ codigo: 'E2E-SIN', linea_catalogo_id: lineaSinDibujo }))
        .expect(400);
      expect((r.body as { message: string }).message).toContain('no tiene su recorrido dibujado');
    });

    it('asignarlo a alguien que no es representante responde 400', async () => {
      const r = await request(servidor)
        .post('/api/administracion/trazados')
        .set(conToken(administrador))
        .send(nuevoTrazado({ codigo: 'E2E-REP', representante_id: UUID_INEXISTENTE }))
        .expect(400);
      expect((r.body as { message: string }).message).toContain('representante no existe');
    });

    it('cambiar un trazado sin decir que cambiar responde 400, y uno que no existe 404', async () => {
      await request(servidor)
        .patch(`/api/administracion/trazados/${nuevo.trazadoId}`)
        .set(conToken(administrador))
        .send({})
        .expect(400);
      await request(servidor)
        .patch(`/api/administracion/trazados/${UUID_INEXISTENTE}`)
        .set(conToken(administrador))
        .send({ activo: false })
        .expect(404);
    });

    it('no se desactiva un trazado con colectivos en servicio (9001 tiene una jornada abierta)', async () => {
      const r = await request(servidor)
        .patch(`/api/administracion/trazados/${TRAZADO_9001}`)
        .set(conToken(administrador))
        .send({ activo: false })
        .expect(400);
      expect((r.body as { message: string }).message).toContain('colectivos en servicio');
      const { rows } = await admin.pg.query<{ activo: boolean }>(`SELECT activo FROM trazados WHERE id = $1`, [
        TRAZADO_9001,
      ]);
      expect(rows[0].activo).toBe(true);
    });

    it('desactivado deja de aparecerle al pasajero', async () => {
      const r = await request(servidor)
        .patch(`/api/administracion/trazados/${nuevo.trazadoId}`)
        .set(conToken(administrador))
        .send({ activo: false })
        .expect(200);
      expect((r.body as TrazadoPanel).activo).toBe(false);

      const activos = await request(servidor).get('/api/trazados').set(conToken(pasajero)).expect(200);
      expect((activos.body as { id: string }[]).map((t) => t.id)).not.toContain(nuevo.trazadoId);
    });
  });

  describe('desactivar un representante', () => {
    it('cierra sus sesiones al tiro y ya no puede iniciar sesion', async () => {
      const abierta = await iniciarSesion(nuevo.correo, CLAVE_REPRESENTANTE).expect(200);
      const token = (abierta.body as { token_acceso: string }).token_acceso;
      await request(servidor).get('/api/trazados/mios').set(conToken(token)).expect(200);

      await request(servidor)
        .patch(`/api/administracion/representantes/${nuevo.representanteId}`)
        .set(conToken(administrador))
        .send({ activo: false })
        .expect(204);

      const { rows } = await admin.pg.query<{ abiertas: number }>(
        `SELECT count(*)::int AS abiertas FROM tokens_refresco WHERE usuario_id = $1 AND revocado_en IS NULL`,
        [nuevo.representanteId],
      );
      expect(rows[0].abiertas).toBe(0);
      // El token que ya tenia deja de servir en la siguiente peticion (SesionGuard revisa "activo").
      await request(servidor).get('/api/trazados/mios').set(conToken(token)).expect(401);
      await iniciarSesion(nuevo.correo, CLAVE_REPRESENTANTE).expect(401);
    });

    it('un id que no es de un representante responde 404 (no sirve para desactivar a otro rol)', async () => {
      const { rows } = await admin.pg.query<{ id: string }>(
        `SELECT id FROM usuarios WHERE correo_electronico = 'pasajero1@colectivos.ejemplo.cl'`,
      );
      await request(servidor)
        .patch(`/api/administracion/representantes/${rows[0].id}`)
        .set(conToken(administrador))
        .send({ activo: false })
        .expect(404);
    });
  });

  describe('defensa en la base de datos', () => {
    it('la cuenta de la API no puede crear un administrador ni con SQL directo (42501)', async () => {
      const api = app.get(BaseDatosServicio);
      await expect(
        api.consultar(
          `INSERT INTO usuarios (nombre_completo, correo_electronico, contrasena_hash, rol)
           VALUES ('Atacante', $1, '$2b$12$abcdefghijklmnopqrstuuJ8y0Q1n6c1V3m8bq9kQ1oXyZr2xQ1Ca', 'administrador')`,
          [`${PREFIJO}atacante@ejemplo.cl`],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('la funcion de la base rechaza a quien no es administrador aunque la API la llame', async () => {
      const api = app.get(BaseDatosServicio);
      await expect(
        api.consultar(`SELECT administrar_crear_representante($1, 'X', $2, $3)`, [
          REPRESENTANTE_9001,
          `${PREFIJO}colado@ejemplo.cl`,
          '$2b$12$abcdefghijklmnopqrstuuJ8y0Q1n6c1V3m8bq9kQ1oXyZr2xQ1Ca',
        ]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });
});
