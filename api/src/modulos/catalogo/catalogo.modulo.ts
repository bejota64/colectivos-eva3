import { Module } from '@nestjs/common';
import { CatalogoControlador } from './catalogo.controlador';
import { CatalogoRepositorio } from './catalogo.repositorio';
import { CatalogoServicio } from './catalogo.servicio';

/** Catalogo oficial de recorridos de colectivos (Evaluacion 3, desarrollo nuevo). */
@Module({
  controllers: [CatalogoControlador],
  providers: [CatalogoRepositorio, CatalogoServicio],
})
export class CatalogoModulo {}
