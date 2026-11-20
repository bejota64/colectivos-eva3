import { Module } from '@nestjs/common';
import { AutenticacionModulo } from '../autenticacion/autenticacion.modulo';
import { AdministracionControlador } from './administracion.controlador';
import { AdministracionRepositorio } from './administracion.repositorio';
import { AdministracionServicio } from './administracion.servicio';

/** Trazados y representantes, gestionados por el administrador desde el panel. */
@Module({
  imports: [AutenticacionModulo],
  controllers: [AdministracionControlador],
  providers: [AdministracionRepositorio, AdministracionServicio],
})
export class AdministracionModulo {}
