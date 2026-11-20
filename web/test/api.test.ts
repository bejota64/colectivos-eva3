import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, cuandoSePierdaLaSesion, ErrorApi, guardarToken } from '../src/comun/api';

function respuesta(estado: number, cuerpo?: unknown): Response {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('cliente de la API', () => {
  const fetchSimulado = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchSimulado.mockReset();
    vi.stubGlobal('fetch', fetchSimulado);
    guardarToken(null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('envia el token en la cabecera Authorization y arma la consulta', async () => {
    guardarToken('token-1');
    fetchSimulado.mockResolvedValueOnce(respuesta(200, []));
    await api('/tiempo-real/colectivos', { consulta: { sentido_id: 'abc', latitud: undefined } });
    const [url, init] = fetchSimulado.mock.calls[0] ?? [];
    expect(url).toBe('/api/tiempo-real/colectivos?sentido_id=abc');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1');
  });

  it('con un 401 renueva la sesion una sola vez aunque fallen varias peticiones juntas', async () => {
    guardarToken('vencido');
    fetchSimulado.mockImplementation(async (entrada, init) => {
      const url = String(entrada);
      if (url === '/api/autenticacion/renovar') {
        return respuesta(200, { token_acceso: 'nuevo', usuario: { id: '1', nombre_completo: 'A', correo_electronico: 'a@b.cl', rol: 'pasajero' } });
      }
      const autorizacion = new Headers(init?.headers).get('Authorization');
      return autorizacion === 'Bearer nuevo' ? respuesta(200, { ok: url }) : respuesta(401, { message: 'Token vencido' });
    });

    const [a, b] = await Promise.all([api<{ ok: string }>('/abordajes/mios'), api<{ ok: string }>('/trazados')]);
    expect(a.ok).toBe('/api/abordajes/mios');
    expect(b.ok).toBe('/api/trazados');
    const renovaciones = fetchSimulado.mock.calls.filter(([url]) => String(url) === '/api/autenticacion/renovar');
    expect(renovaciones).toHaveLength(1);
  });

  it('si la sesion no se puede renovar, avisa a la app y responde 401', async () => {
    const perdida = vi.fn();
    cuandoSePierdaLaSesion(perdida);
    fetchSimulado.mockResolvedValue(respuesta(401, { message: 'Sesion no valida' }));
    await expect(api('/usuarios/yo')).rejects.toMatchObject({ estado: 401 });
    expect(perdida).toHaveBeenCalledOnce();
  });

  it('traduce los errores de validacion de NestJS a un solo mensaje', async () => {
    fetchSimulado.mockResolvedValueOnce(
      respuesta(400, { message: ['monto debe ser mayor a 1000', 'nombre es muy corto'], error: 'Bad Request', statusCode: 400 }),
    );
    const error = await api('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).message).toBe('monto debe ser mayor a 1000. nombre es muy corto');
  });

  it('explica el limite de intentos (429) en lenguaje simple', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(429, { message: 'ThrottlerException: Too Many Requests' }));
    await expect(api('/autenticacion/inicio-sesion', { metodo: 'POST', cuerpo: {} })).rejects.toThrow(/Espera un minuto/);
  });

  it('una respuesta 204 no se intenta leer como JSON', async () => {
    fetchSimulado.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api('/avisos-espera/actual', { metodo: 'DELETE' })).resolves.toBeUndefined();
  });
});
