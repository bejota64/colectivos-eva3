import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { crearAuditoriaFalsa, IDS } from '../../../test/datos/recorrido-9001';
import type { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { ContrasenasServicio } from '../autenticacion/contrasenas.servicio';
import type { AdministracionRepositorio } from './administracion.repositorio';
import { AdministracionServicio } from './administracion.servicio';

const ADMINISTRADOR = '00000000-0000-4000-8000-000000000001';
const NUEVO_ID = '00000000-0000-4000-8000-000000000500';
const SESION = { administradorId: ADMINISTRADOR, ip: '127.0.0.1' };
const HASH_FALSO = '$2b$12$hashfalsoparalaspruebasunitariasdelservicio0000000000';

/** Error con la forma que entrega el driver pg cuando la funcion SQL hace RAISE. */
const errorPg = (code: string, message = 'error de prueba') => Object.assign(new Error(message), { code });

const NUEVO_TRAZADO = {
  codigo: '9002',
  nombre: 'Plaza de Puente Alto - Hospital Sotero del Rio',
  comuna: 'Puente Alto',
  representanteId: IDS.representante,
  lineaCatalogoId: 42,
  origen: 'Plaza de Puente Alto',
  destino: 'Hospital Sotero del Rio',
};

describe('AdministracionServicio (CU-13)', () => {
  // Una sola instancia: el constructor calcula un hash bcrypt de costo 12.
  const contrasenas = new ContrasenasServicio();
  let auditoria: ReturnType<typeof crearAuditoriaFalsa>;
  let repositorio: jest.Mocked<
    Pick<
      AdministracionRepositorio,
      | 'crearTrazado'
      | 'actualizarTrazado'
      | 'buscarTrazado'
      | 'crearRepresentante'
      | 'cambiarEstadoRepresentante'
    >
  >;
  let servicio: AdministracionServicio;

  beforeEach(() => {
    jest.spyOn(contrasenas, 'generarHash').mockResolvedValue(HASH_FALSO);
    auditoria = crearAuditoriaFalsa();
    repositorio = {
      crearTrazado: jest.fn().mockResolvedValue(NUEVO_ID),
      actualizarTrazado: jest.fn().mockResolvedValue(true),
      buscarTrazado: jest.fn().mockResolvedValue({ id: NUEVO_ID, codigo: '9002' }),
      crearRepresentante: jest.fn().mockResolvedValue(NUEVO_ID),
      cambiarEstadoRepresentante: jest.fn().mockResolvedValue(true),
    };
    servicio = new AdministracionServicio(
      repositorio as unknown as AdministracionRepositorio,
      auditoria as unknown as AuditoriaServicio,
      contrasenas,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('trazados', () => {
    it('crea el trazado a nombre del administrador y lo deja en la auditoria', async () => {
      const creado = await servicio.crearTrazado(NUEVO_TRAZADO, SESION);

      expect(repositorio.crearTrazado).toHaveBeenCalledWith(ADMINISTRADOR, NUEVO_TRAZADO);
      expect(creado).toEqual({ id: NUEVO_ID, codigo: '9002' });
      expect(auditoria.eventos).toHaveLength(1);
      expect(auditoria.eventos[0]).toMatchObject({
        tipo: 'cambio_datos_maestros',
        detalle: { entidad: 'trazado', accion: 'crear', trazado_id: NUEVO_ID, linea_catalogo_id: 42 },
      });
    });

    it('un codigo repetido responde 409 y no deja nada en la auditoria', async () => {
      repositorio.crearTrazado.mockRejectedValue(errorPg('23505'));
      await expect(servicio.crearTrazado(NUEVO_TRAZADO, SESION)).rejects.toBeInstanceOf(ConflictException);
      expect(auditoria.eventos).toHaveLength(0);
    });

    it('si la base dice que no es administrador (42501) responde 403', async () => {
      repositorio.crearTrazado.mockRejectedValue(errorPg('42501', 'Accion reservada al administrador'));
      await expect(servicio.crearTrazado(NUEVO_TRAZADO, SESION)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('una linea sin recorrido dibujado responde 400 con un mensaje para el panel', async () => {
      repositorio.crearTrazado.mockRejectedValue(
        errorPg('22023', 'La linea del catalogo no tiene su recorrido dibujado en ambos sentidos'),
      );
      await expect(servicio.crearTrazado(NUEVO_TRAZADO, SESION)).rejects.toThrow(
        'Esa línea del catálogo no tiene su recorrido dibujado en ambos sentidos',
      );
    });

    it('un error inesperado de la base no se disfraza: sigue su curso', async () => {
      const caida = new Error('conexion perdida');
      repositorio.crearTrazado.mockRejectedValue(caida);
      await expect(servicio.crearTrazado(NUEVO_TRAZADO, SESION)).rejects.toBe(caida);
    });

    it('cambiar un trazado sin indicar que cambiar responde 400 sin tocar la base', async () => {
      await expect(servicio.actualizarTrazado(NUEVO_ID, {}, SESION)).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.actualizarTrazado).not.toHaveBeenCalled();
    });

    it('cambiar un trazado que no existe responde 404', async () => {
      repositorio.actualizarTrazado.mockResolvedValue(false);
      await expect(servicio.actualizarTrazado(NUEVO_ID, { activo: false }, SESION)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(auditoria.eventos).toHaveLength(0);
    });

    it('desactivar un trazado queda en la auditoria con el cambio', async () => {
      await servicio.actualizarTrazado(NUEVO_ID, { activo: false }, SESION);
      expect(repositorio.actualizarTrazado).toHaveBeenCalledWith(ADMINISTRADOR, NUEVO_ID, { activo: false });
      expect(auditoria.eventos[0].detalle).toMatchObject({
        entidad: 'trazado',
        accion: 'cambiar',
        cambios: { activo: false },
      });
    });
  });

  describe('representantes', () => {
    const DATOS = {
      nombreCompleto: 'Representante de Prueba',
      correo: 'representante.nuevo@colectivos.test',
      contrasena: 'una frase larga de prueba 2026',
    };

    it('una contrasena de menos de 15 caracteres se rechaza antes de llegar a la base', async () => {
      await expect(
        servicio.crearRepresentante({ ...DATOS, contrasena: 'corta12345' }, SESION),
      ).rejects.toThrow('al menos 15 caracteres');
      expect(repositorio.crearRepresentante).not.toHaveBeenCalled();
    });

    it('a la base llega el hash, nunca la contrasena, y la auditoria no guarda ninguno de los dos', async () => {
      const creado = await servicio.crearRepresentante(DATOS, SESION);

      expect(repositorio.crearRepresentante).toHaveBeenCalledWith(ADMINISTRADOR, {
        nombreCompleto: DATOS.nombreCompleto,
        correo: DATOS.correo,
        contrasenaHash: HASH_FALSO,
      });
      expect(creado).toMatchObject({ id: NUEVO_ID, activo: true, trazados: [] });
      expect(JSON.stringify(creado)).not.toContain(DATOS.contrasena);
      const auditado = JSON.stringify(auditoria.eventos);
      expect(auditado).not.toContain(DATOS.contrasena);
      expect(auditado).not.toContain(HASH_FALSO);
      expect(auditoria.eventos[0].detalle).toEqual({
        entidad: 'representante',
        accion: 'crear',
        representante_id: NUEVO_ID,
      });
    });

    it('un correo que ya tiene cuenta responde 409', async () => {
      repositorio.crearRepresentante.mockRejectedValue(errorPg('23505'));
      await expect(servicio.crearRepresentante(DATOS, SESION)).rejects.toThrow('Ya existe una cuenta con ese correo');
    });

    it('desactivar un representante que no existe responde 404', async () => {
      repositorio.cambiarEstadoRepresentante.mockResolvedValue(false);
      await expect(servicio.cambiarEstadoRepresentante(NUEVO_ID, false, SESION)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(auditoria.eventos).toHaveLength(0);
    });

    it('desactivar un representante queda en la auditoria', async () => {
      await servicio.cambiarEstadoRepresentante(NUEVO_ID, false, SESION);
      expect(auditoria.eventos[0].detalle).toEqual({
        entidad: 'representante',
        accion: 'desactivar',
        representante_id: NUEVO_ID,
      });
    });
  });
});
