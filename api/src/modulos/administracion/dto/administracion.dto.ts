import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { recortar } from '../../../comun/transformaciones';

const enMayusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/**
 * Trazado nuevo a partir de una linea del catalogo oficial: el recorrido
 * (ida y vuelta) se copia desde el catalogo, no lo escribe el administrador.
 */
export class NuevoTrazadoDto {
  /** Numero de la linea o codigo interno, por ejemplo 4008 o 9001-B. */
  @Transform(enMayusculas)
  @IsString()
  @Matches(/^[0-9A-Z][0-9A-Z-]{0,9}$/, { message: 'codigo debe tener de 1 a 10 letras, numeros o guiones' })
  codigo!: string;

  @Transform(recortar)
  @IsString()
  @Length(3, 80)
  nombre!: string;

  @Transform(recortar)
  @IsString()
  @Length(3, 60)
  @Matches(/^[\p{L} .'-]+$/u, { message: 'comuna solo admite letras, espacios, puntos y guiones' })
  comuna!: string;

  @IsUUID()
  representante_id!: string;

  @IsInt()
  @Min(1)
  linea_catalogo_id!: number;

  /** Donde parte el sentido de ida (la vuelta va al reves). */
  @Transform(recortar)
  @IsString()
  @Length(3, 80)
  origen!: string;

  @Transform(recortar)
  @IsString()
  @Length(3, 80)
  destino!: string;
}

/** Cambiar el representante, activar o desactivar. Lo que no viene no cambia. */
export class CambioTrazadoDto {
  @IsOptional()
  @IsUUID()
  representante_id?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

/** Cuenta de representante. El rol lo pone la base de datos, nunca el formulario. */
export class NuevoRepresentanteDto {
  @Transform(recortar)
  @IsString()
  @Length(3, 120)
  nombre_completo!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  correo_electronico!: string;

  /** Contrasena inicial (15 a 64): la politica completa la revisa el servicio. */
  @IsString()
  @Length(15, 64)
  contrasena!: string;
}

export class EstadoCuentaDto {
  @IsBoolean()
  activo!: boolean;
}
