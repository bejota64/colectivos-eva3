import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Autenticado } from '../../comun/decoradores/autenticado.decorador';
import { CatalogoServicio } from './catalogo.servicio';
import { BuscarLineasDto, LineasCercanasDto, RecuadroMapaDto } from './dto/catalogo.dto';

/**
 * Catalogo oficial de recorridos de colectivos (RNTPP). Solo lectura y para
 * cualquier persona con sesion, igual que el mapa (decision del 8 de octubre:
 * ver el mapa exige cuenta).
 */
@Controller('catalogo')
export class CatalogoControlador {
  constructor(private readonly catalogo: CatalogoServicio) {}

  /** «¿Que colectivo me sirve?»: por numero, calle, lugar o comuna. */
  @Autenticado()
  @Get('lineas')
  buscar(@Query() consulta: BuscarLineasDto) {
    return this.catalogo.buscar(consulta.buscar, consulta.comuna, consulta.limite);
  }

  /** Lineas que pasan cerca de un punto. Va antes de :id para que «cercanas» no se lea como id. */
  @Autenticado()
  @Get('lineas/cercanas')
  cercanas(@Query() consulta: LineasCercanasDto) {
    return this.catalogo.cercanas(consulta.latitud, consulta.longitud, consulta.radio_m);
  }

  /** Lineas dibujadas en el mapa principal: las que pasan por el recuadro visible, recortadas a el. */
  @Autenticado()
  @Get('mapa')
  mapa(@Query() recuadro: RecuadroMapaDto) {
    return this.catalogo.mapa(recuadro);
  }

  /** Detalle: calles en orden y la linea dibujada de cada sentido. */
  @Autenticado()
  @Get('lineas/:id')
  detalle(@Param('id', new ParseIntPipe()) id: number) {
    return this.catalogo.detalle(id);
  }

  @Autenticado()
  @Get('comunas')
  comunas() {
    return this.catalogo.comunas();
  }
}
