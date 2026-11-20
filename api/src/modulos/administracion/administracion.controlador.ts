import { Body, Controller, Get, HttpCode, Ip, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../comun/decoradores/roles.decorador';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorador';
import type { UsuarioSesion } from '../../comun/tipos';
import { AdministracionServicio } from './administracion.servicio';
import {
  CambioTrazadoDto,
  EstadoCuentaDto,
  NuevoRepresentanteDto,
  NuevoTrazadoDto,
} from './dto/administracion.dto';

/**
 * Panel del administrador (CU-13): trazados y representantes. Solo el rol
 * administrador; ademas, la base vuelve a comprobarlo en cada cambio.
 */
@Roles('administrador')
@Controller('administracion')
export class AdministracionControlador {
  constructor(private readonly administracion: AdministracionServicio) {}

  @Get('trazados')
  listarTrazados() {
    return this.administracion.listarTrazados();
  }

  @Post('trazados')
  crearTrazado(@UsuarioActual() sesion: UsuarioSesion, @Body() datos: NuevoTrazadoDto, @Ip() ip: string) {
    return this.administracion.crearTrazado(
      {
        codigo: datos.codigo,
        nombre: datos.nombre,
        comuna: datos.comuna,
        representanteId: datos.representante_id,
        lineaCatalogoId: datos.linea_catalogo_id,
        origen: datos.origen,
        destino: datos.destino,
      },
      { administradorId: sesion.id, ip },
    );
  }

  @Patch('trazados/:trazadoId')
  actualizarTrazado(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('trazadoId', new ParseUUIDPipe()) trazadoId: string,
    @Body() cambios: CambioTrazadoDto,
    @Ip() ip: string,
  ) {
    return this.administracion.actualizarTrazado(
      trazadoId,
      { representanteId: cambios.representante_id, activo: cambios.activo },
      { administradorId: sesion.id, ip },
    );
  }

  @Get('representantes')
  listarRepresentantes() {
    return this.administracion.listarRepresentantes();
  }

  @Post('representantes')
  crearRepresentante(
    @UsuarioActual() sesion: UsuarioSesion,
    @Body() datos: NuevoRepresentanteDto,
    @Ip() ip: string,
  ) {
    return this.administracion.crearRepresentante(
      { nombreCompleto: datos.nombre_completo, correo: datos.correo_electronico, contrasena: datos.contrasena },
      { administradorId: sesion.id, ip },
    );
  }

  @Patch('representantes/:representanteId')
  @HttpCode(204)
  async cambiarEstadoRepresentante(
    @UsuarioActual() sesion: UsuarioSesion,
    @Param('representanteId', new ParseUUIDPipe()) representanteId: string,
    @Body() datos: EstadoCuentaDto,
    @Ip() ip: string,
  ): Promise<void> {
    await this.administracion.cambiarEstadoRepresentante(representanteId, datos.activo, {
      administradorId: sesion.id,
      ip,
    });
  }
}
