import { Injectable } from '@nestjs/common';
import { BaseDatosServicio } from '../../comun/base-datos/base-datos.servicio';

export interface TrazadoAdministracion {
  id: string;
  codigo: string;
  nombre: string;
  comuna: string;
  activo: boolean;
  representante: { id: string; nombre_completo: string; correo_electronico: string; activo: boolean };
  sentidos: { sentido: 'ida' | 'vuelta'; origen: string; destino: string }[];
  vehiculos: number;
  conductores: number;
  en_servicio: number;
}

export interface RepresentanteAdministracion {
  id: string;
  nombre_completo: string;
  correo_electronico: string;
  activo: boolean;
  creado_en: string;
  trazados: { id: string; codigo: string; nombre: string; activo: boolean }[];
}

/**
 * Datos del administrador. Leer: consultas normales (la API tiene SELECT).
 * Crear o cambiar trazados y representantes: solo con las funciones de
 * 07_administracion.sql, que vuelven a comprobar que quien pide es un
 * administrador activo. La cuenta de la API no puede hacerlo de otra forma.
 */
@Injectable()
export class AdministracionRepositorio {
  constructor(private readonly baseDatos: BaseDatosServicio) {}

  listarTrazados(): Promise<TrazadoAdministracion[]> {
    return this.baseDatos.consultar<TrazadoAdministracion>(
      `SELECT t.id, t.codigo, t.nombre, t.comuna, t.activo,
              json_build_object('id', u.id, 'nombre_completo', u.nombre_completo,
                                'correo_electronico', u.correo_electronico, 'activo', u.activo) AS representante,
              COALESCE((SELECT json_agg(json_build_object('sentido', s.sentido, 'origen', s.origen, 'destino', s.destino)
                                 ORDER BY s.sentido)
                          FROM sentidos s WHERE s.trazado_id = t.id), '[]') AS sentidos,
              (SELECT count(*)::int FROM vehiculos v WHERE v.trazado_id = t.id AND v.activo) AS vehiculos,
              (SELECT count(*)::int FROM conductores c WHERE c.trazado_id = t.id AND c.habilitado) AS conductores,
              (SELECT count(*)::int FROM jornadas j JOIN vehiculos v ON v.id = j.vehiculo_id
                WHERE v.trazado_id = t.id AND j.finalizada_en IS NULL) AS en_servicio
         FROM trazados t
         JOIN usuarios u ON u.id = t.representante_id
        ORDER BY t.activo DESC, t.codigo`,
    );
  }

  async buscarTrazado(id: string): Promise<TrazadoAdministracion | undefined> {
    const filas = await this.listarTrazados();
    return filas.find((t) => t.id === id);
  }

  async crearTrazado(
    administradorId: string,
    datos: {
      codigo: string;
      nombre: string;
      comuna: string;
      representanteId: string;
      lineaCatalogoId: number;
      origen: string;
      destino: string;
    },
  ): Promise<string> {
    const [fila] = await this.baseDatos.consultar<{ id: string }>(
      `SELECT administrar_crear_trazado($1, $2, $3, $4, $5, $6, $7, $8) AS id`,
      [
        administradorId,
        datos.codigo,
        datos.nombre,
        datos.comuna,
        datos.representanteId,
        datos.lineaCatalogoId,
        datos.origen,
        datos.destino,
      ],
    );
    return fila.id;
  }

  async actualizarTrazado(
    administradorId: string,
    trazadoId: string,
    cambios: { representanteId?: string; activo?: boolean },
  ): Promise<boolean> {
    const [fila] = await this.baseDatos.consultar<{ encontrado: boolean }>(
      `SELECT administrar_actualizar_trazado($1, $2, $3, $4) AS encontrado`,
      [administradorId, trazadoId, cambios.representanteId ?? null, cambios.activo ?? null],
    );
    return fila.encontrado;
  }

  listarRepresentantes(): Promise<RepresentanteAdministracion[]> {
    return this.baseDatos.consultar<RepresentanteAdministracion>(
      `SELECT u.id, u.nombre_completo, u.correo_electronico, u.activo, u.creado_en,
              COALESCE((SELECT json_agg(json_build_object('id', t.id, 'codigo', t.codigo, 'nombre', t.nombre,
                                                         'activo', t.activo) ORDER BY t.codigo)
                          FROM trazados t WHERE t.representante_id = u.id), '[]') AS trazados
         FROM usuarios u
        WHERE u.rol = 'representante' AND u.eliminado_en IS NULL
        ORDER BY u.activo DESC, u.nombre_completo`,
    );
  }

  async crearRepresentante(
    administradorId: string,
    datos: { nombreCompleto: string; correo: string; contrasenaHash: string },
  ): Promise<string> {
    const [fila] = await this.baseDatos.consultar<{ id: string }>(
      `SELECT administrar_crear_representante($1, $2, $3, $4) AS id`,
      [administradorId, datos.nombreCompleto, datos.correo, datos.contrasenaHash],
    );
    return fila.id;
  }

  /**
   * Activa o desactiva una cuenta de representante. Al desactivarla se
   * revocan sus sesiones: el efecto es inmediato. Devuelve false si el id
   * no es de un representante.
   */
  cambiarEstadoRepresentante(id: string, activo: boolean): Promise<boolean> {
    return this.baseDatos.enTransaccion(async (consultar) => {
      const filas = await consultar<{ id: string }>(
        `UPDATE usuarios SET activo = $2
          WHERE id = $1 AND rol = 'representante' AND eliminado_en IS NULL
          RETURNING id`,
        [id, activo],
      );
      if (filas.length === 0) {
        return false;
      }
      if (!activo) {
        await consultar(
          `UPDATE tokens_refresco SET revocado_en = now() WHERE usuario_id = $1 AND revocado_en IS NULL`,
          [id],
        );
      }
      return true;
    });
  }
}
