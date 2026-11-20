import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { codigoDeError, VIOLACION_DE_UNICIDAD } from '../../comun/base-datos/errores-postgres';
import { AuditoriaServicio } from '../auditoria/auditoria.servicio';
import { ContrasenasServicio } from '../autenticacion/contrasenas.servicio';
import { AdministracionRepositorio } from './administracion.repositorio';

type Sesion = { administradorId: string; ip?: string };

/** Codigos que levantan las funciones de 07_administracion.sql. */
const SIN_PERMISO = '42501';
const DATO_INVALIDO = '22023';

/** Mensajes de la base (sin tildes, por convencion del SQL) a mensajes para el panel. */
const MENSAJES: Record<string, string> = {
  'El representante no existe o no esta activo': 'El representante no existe o no está activo',
  'La linea del catalogo no tiene su recorrido dibujado en ambos sentidos':
    'Esa línea del catálogo no tiene su recorrido dibujado en ambos sentidos',
  'El trazado tiene colectivos en servicio':
    'El trazado tiene colectivos en servicio: espera a que cierren sus jornadas para desactivarlo',
};

/**
 * Lo que hace el administrador desde el panel (CU-13): trazados y cuentas
 * de representante. Cada cambio queda en la auditoria. Las contrasenas
 * nunca se guardan en la auditoria ni en el registro del servidor.
 */
@Injectable()
export class AdministracionServicio {
  constructor(
    private readonly repositorio: AdministracionRepositorio,
    private readonly auditoria: AuditoriaServicio,
    private readonly contrasenas: ContrasenasServicio,
  ) {}

  private registrar(sesion: Sesion, detalle: Record<string, unknown>) {
    return this.auditoria.registrar({
      tipo: 'cambio_datos_maestros',
      usuarioId: sesion.administradorId,
      ip: sesion.ip,
      detalle,
    });
  }

  /** Traduce los errores esperables de la base; el resto sigue su curso (500 generico). */
  private traducir(error: unknown, duplicado: string): never {
    const codigo = codigoDeError(error);
    if (codigo === VIOLACION_DE_UNICIDAD) {
      throw new ConflictException(duplicado);
    }
    if (codigo === SIN_PERMISO) {
      throw new ForbiddenException('Acción reservada al administrador');
    }
    if (codigo === DATO_INVALIDO) {
      const mensaje = (error as { message?: string }).message ?? '';
      throw new BadRequestException(MENSAJES[mensaje] ?? 'Datos inválidos');
    }
    throw error;
  }

  listarTrazados() {
    return this.repositorio.listarTrazados();
  }

  async crearTrazado(
    datos: {
      codigo: string;
      nombre: string;
      comuna: string;
      representanteId: string;
      lineaCatalogoId: number;
      origen: string;
      destino: string;
    },
    sesion: Sesion,
  ) {
    let id: string;
    try {
      id = await this.repositorio.crearTrazado(sesion.administradorId, datos);
    } catch (error) {
      this.traducir(error, 'Ya existe un trazado con ese código');
    }
    await this.registrar(sesion, {
      entidad: 'trazado',
      accion: 'crear',
      trazado_id: id,
      codigo: datos.codigo,
      linea_catalogo_id: datos.lineaCatalogoId,
      representante_id: datos.representanteId,
    });
    return this.repositorio.buscarTrazado(id);
  }

  async actualizarTrazado(
    trazadoId: string,
    cambios: { representanteId?: string; activo?: boolean },
    sesion: Sesion,
  ) {
    if (cambios.representanteId === undefined && cambios.activo === undefined) {
      throw new BadRequestException('Indica qué cambiar: representante_id o activo');
    }
    let encontrado: boolean;
    try {
      encontrado = await this.repositorio.actualizarTrazado(sesion.administradorId, trazadoId, cambios);
    } catch (error) {
      this.traducir(error, 'Ya existe un trazado con ese código');
    }
    if (!encontrado) {
      throw new NotFoundException('Trazado no encontrado');
    }
    await this.registrar(sesion, {
      entidad: 'trazado',
      accion: 'cambiar',
      trazado_id: trazadoId,
      cambios: { representante_id: cambios.representanteId, activo: cambios.activo },
    });
    return this.repositorio.buscarTrazado(trazadoId);
  }

  listarRepresentantes() {
    return this.repositorio.listarRepresentantes();
  }

  /** Misma politica que el resto de las cuentas: 15 caracteres como minimo para representantes. */
  async crearRepresentante(
    datos: { nombreCompleto: string; correo: string; contrasena: string },
    sesion: Sesion,
  ) {
    const motivo = this.contrasenas.revisarPolitica(datos.contrasena, 'representante');
    if (motivo) {
      throw new BadRequestException(motivo);
    }
    const contrasenaHash = await this.contrasenas.generarHash(datos.contrasena);
    let id: string;
    try {
      id = await this.repositorio.crearRepresentante(sesion.administradorId, {
        nombreCompleto: datos.nombreCompleto,
        correo: datos.correo,
        contrasenaHash,
      });
    } catch (error) {
      this.traducir(error, 'Ya existe una cuenta con ese correo');
    }
    await this.registrar(sesion, { entidad: 'representante', accion: 'crear', representante_id: id });
    return {
      id,
      nombre_completo: datos.nombreCompleto,
      correo_electronico: datos.correo,
      activo: true,
      trazados: [],
    };
  }

  /** Desactivar cierra sus sesiones al tiro; sus trazados siguen funcionando. */
  async cambiarEstadoRepresentante(id: string, activo: boolean, sesion: Sesion): Promise<void> {
    if (!(await this.repositorio.cambiarEstadoRepresentante(id, activo))) {
      throw new NotFoundException('Representante no encontrado');
    }
    await this.registrar(sesion, {
      entidad: 'representante',
      accion: activo ? 'activar' : 'desactivar',
      representante_id: id,
    });
  }
}
