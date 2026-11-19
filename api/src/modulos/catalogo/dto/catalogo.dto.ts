import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

/** ?buscar=concha toro&comuna=Puente Alto */
export class BuscarLineasDto {
  /** Numero de linea, calle, lugar o comuna. Letras, numeros y signos comunes de nombres de calles. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[\p{L}\p{N} .,'°#-]+$/u, { message: 'buscar solo admite letras, numeros y espacios' })
  buscar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[\p{L} .'-]+$/u, { message: 'comuna no es valida' })
  comuna?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limite?: number;
}

/** ?latitud&longitud&radio_m: lineas que pasan cerca de un punto de Chile. */
export class LineasCercanasDto {
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-56.5)
  @Max(-17.0)
  latitud!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-76.0)
  @Max(-66.0)
  longitud!: number;

  /** Hasta 1 km: mas alla ya no es «cerca» caminando. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(1000)
  radio_m?: number;
}
