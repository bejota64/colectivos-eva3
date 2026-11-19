import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarAplicacion } from '../src/configurar-aplicacion';

/**
 * Catalogo oficial de recorridos (Evaluacion 3, desarrollo nuevo): los
 * recorridos de colectivos de la Region Metropolitana del registro del MTT,
 * cargados por bd/postgres/inicio/05_catalogo_datos.sql. Solo lee.
 */

const CLAVE = 'Clave.Prueba.2026';
const SENTIDO_IDA_9001 = '00000000-0000-4000-8000-000000000101';

interface Resumen {
  id: number;
  nombre: string;
  desde: string;
  hasta: string;
  comunas: string[];
  numero_linea: string | null;
}

describe('Catalogo de recorridos reales (RNTPP)', () => {
  let app: INestApplication;
  let servidor: Parameters<typeof request>[0];
  let pasajero: string;

  const conToken = () => ({ Authorization: `Bearer ${pasajero}` });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarAplicacion(app as NestExpressApplication);
    await app.init();
    servidor = app.getHttpServer() as Parameters<typeof request>[0];
    const sesion = await request(servidor)
      .post('/api/autenticacion/inicio-sesion')
      .send({ correo_electronico: 'pasajero1@colectivos.ejemplo.cl', contrasena: CLAVE });
    pasajero = (sesion.body as { token_acceso: string }).token_acceso;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin sesion responde 401 (ver recorridos exige cuenta)', async () => {
    await request(servidor).get('/api/catalogo/lineas').expect(401);
  });

  it('carga los recorridos de colectivos de la Region Metropolitana', async () => {
    const r = await request(servidor).get('/api/catalogo/comunas').set(conToken()).expect(200);
    const comunas = (r.body as { comuna: string; lineas: number }[]).map((c) => c.comuna);
    expect(comunas).toEqual(expect.arrayContaining(['Puente Alto', 'La Florida', 'Santiago', 'Maipú']));
  });

  it('busca por calle sin importar tildes ni mayusculas', async () => {
    const r = await request(servidor)
      .get('/api/catalogo/lineas')
      .query({ buscar: 'VICUNA mackenna', comuna: 'Puente Alto' })
      .set(conToken())
      .expect(200);
    const lineas = r.body as Resumen[];
    expect(lineas.length).toBeGreaterThan(0);
    for (const linea of lineas) {
      expect(linea.comunas).toContain('Puente Alto');
      expect(linea.nombre).toMatch(/^(Línea|Folio) /);
      expect(linea.desde).toBeTruthy();
      expect(linea.hasta).toBeTruthy();
    }
  });

  it('el detalle trae las calles en orden por sentido', async () => {
    const lista = await request(servidor)
      .get('/api/catalogo/lineas')
      .query({ comuna: 'Puente Alto', limite: 1 })
      .set(conToken())
      .expect(200);
    const [primera] = lista.body as Resumen[];
    expect(primera).toBeDefined();
    const r = await request(servidor).get(`/api/catalogo/lineas/${primera?.id}`).set(conToken()).expect(200);
    const detalle = r.body as { folio: number; sentidos: { sentido: string; calles: { orden: number }[] }[] };
    expect(detalle.folio).toBeGreaterThan(0);
    expect(detalle.sentidos.length).toBeGreaterThan(0);
    const ordenes = detalle.sentidos[0]?.calles.map((c) => c.orden) ?? [];
    expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b));
    expect(ordenes[0]).toBe(1);
  });

  it('solo entrega datos del recorrido, nunca de personas del registro original', async () => {
    const r = await request(servidor).get('/api/catalogo/lineas').query({ limite: 50 }).set(conToken()).expect(200);
    const permitidos = [
      'id', 'nombre', 'numero_linea', 'empresa', 'tipo_servicio', 'variante', 'alternativo',
      'circular', 'desde', 'hasta', 'comunas', 'tiene_trazado',
    ];
    for (const linea of r.body as Record<string, unknown>[]) {
      expect(Object.keys(linea).every((clave) => permitidos.includes(clave))).toBe(true);
    }
  });

  it('rechaza texto con simbolos de SQL antes de llegar a la base', async () => {
    await request(servidor)
      .get('/api/catalogo/lineas')
      .query({ buscar: "x'; DROP TABLE catalogo_lineas; --" })
      .set(conToken())
      .expect(400);
  });

  it('un id que no es numero responde 400 y uno que no existe 404', async () => {
    await request(servidor).get('/api/catalogo/lineas/abc').set(conToken()).expect(400);
    await request(servidor).get('/api/catalogo/lineas/999999').set(conToken()).expect(404);
  });

  it('lineas cercanas exige coordenadas dentro de Chile', async () => {
    await request(servidor).get('/api/catalogo/lineas/cercanas').set(conToken()).expect(400);
    await request(servidor)
      .get('/api/catalogo/lineas/cercanas')
      .query({ latitud: 48.85, longitud: 2.35 })
      .set(conToken())
      .expect(400);
    const r = await request(servidor)
      .get('/api/catalogo/lineas/cercanas')
      .query({ latitud: -33.6012, longitud: -70.5774, radio_m: 500 })
      .set(conToken())
      .expect(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('en la Plaza de Puente Alto encuentra lineas que pasan cerca, ordenadas por distancia', async () => {
    const r = await request(servidor)
      .get('/api/catalogo/lineas/cercanas')
      .query({ latitud: -33.6105, longitud: -70.5757, radio_m: 400 })
      .set(conToken())
      .expect(200);
    const lineas = r.body as (Resumen & { distancia_m: number; tiene_trazado: boolean })[];
    expect(lineas.length).toBeGreaterThan(3);
    expect(lineas.every((l) => l.tiene_trazado && l.distancia_m <= 400)).toBe(true);
    const distancias = lineas.map((l) => l.distancia_m);
    expect(distancias).toEqual([...distancias].sort((a, b) => a - b));
    expect(lineas.some((l) => l.comunas.includes('Puente Alto'))).toBe(true);
  });

  it('una linea dibujada trae su recorrido en el mapa con la distancia acumulada', async () => {
    const lista = await request(servidor)
      .get('/api/catalogo/lineas/cercanas')
      .query({ latitud: -33.6105, longitud: -70.5757, radio_m: 400 })
      .set(conToken())
      .expect(200);
    const [primera] = lista.body as Resumen[];
    const r = await request(servidor).get(`/api/catalogo/lineas/${primera?.id}`).set(conToken()).expect(200);
    const detalle = r.body as { sentidos: { puntos: { distancia_acumulada_m: number }[] }[] };
    const puntos = detalle.sentidos[0]?.puntos ?? [];
    expect(puntos.length).toBeGreaterThan(10);
    expect(puntos[0]?.distancia_acumulada_m).toBe(0);
    const distancias = puntos.map((p) => p.distancia_acumulada_m);
    expect(distancias).toEqual([...distancias].sort((a, b) => a - b));
  });

  it('el recorrido de un trazado trae la distancia acumulada (la usa la web)', async () => {
    const r = await request(servidor)
      .get(`/api/trazados/sentidos/${SENTIDO_IDA_9001}/recorrido`)
      .set(conToken())
      .expect(200);
    const puntos = r.body as { distancia_acumulada_m: number }[];
    expect(puntos[0]?.distancia_acumulada_m).toBe(0);
    expect(puntos.at(-1)?.distancia_acumulada_m).toBeGreaterThan(1000);
  });
});
