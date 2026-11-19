import { NotFoundException } from '@nestjs/common';
import type { CatalogoRepositorio, LineaFila } from './catalogo.repositorio';
import { agruparSentidos, CatalogoServicio, lugarCorto, normalizar, palabras, patron, resumir } from './catalogo.servicio';

const FILA: LineaFila = {
  id: 7,
  folio: 234001,
  numero_linea: '4001',
  empresa: 'COPAC LTDA.',
  tipo_servicio: 'urbano',
  nombre_recorrido: 'T',
  tipo_trazado: 'principal',
  flota_vigente: 13,
  origen: 'Puente Alto',
  comuna_origen: 'Puente Alto',
  lugar_origen: 'Los Lirios',
  destino: 'Puente Alto',
  comuna_destino: 'Puente Alto',
  lugar_destino: 'Circunvalacion: Doctor Eduardo Cordero Altura Av. Concha y Toro',
  comunas: ['Puente Alto'],
  primera_calle: 'Los Lirios',
  tiene_trazado: true,
};

describe('Catalogo de recorridos', () => {
  describe('normalizar y patron (busqueda segura)', () => {
    it('quita tildes y mayusculas igual que texto_busqueda() de la base', () => {
      expect(normalizar('  Av. VICUÑA   Mackenna ')).toBe('av. vicuna mackenna');
      expect(normalizar('Ñuñoa')).toBe('nunoa');
    });

    it('escapa los comodines de LIKE para que el texto se busque tal cual', () => {
      expect(patron('100%')).toBe('%100\\%%');
      expect(patron('a_b')).toBe('%a\\_b%');
      expect(patron('c\\d')).toBe('%c\\\\d%');
    });

    it('usa hasta 4 palabras de 2 letras o mas', () => {
      expect(palabras('Av Concha y Toro')).toEqual(['av', 'concha', 'toro']);
      expect(palabras('a b c d e f gg hh ii jj kk')).toEqual(['gg', 'hh', 'ii', 'jj']);
      expect(palabras(undefined)).toEqual([]);
    });
  });

  describe('lugarCorto', () => {
    it('quita «Circunvalacion:» y lo que va despues de «altura» o «N°»', () => {
      expect(lugarCorto('Circunvalacion: Doctor Eduardo Cordero Altura Av. Concha y Toro')).toBe('Doctor Eduardo Cordero');
      expect(lugarCorto('Av. Vicuña Mackenna Oriente N° 7492 (Ex Shell)')).toBe('Av. Vicuña Mackenna Oriente');
      expect(lugarCorto('Circunvalacion: Av. Concha y Toro Oriente Retorno Altura San Carlos')).toBe('Av. Concha y Toro Oriente');
      expect(lugarCorto('Sargento Aldea con Barros Arana')).toBe('Sargento Aldea con Barros Arana');
      expect(lugarCorto(null)).toBeNull();
    });
  });

  describe('resumir', () => {
    it('arma el nombre visible, desde y hasta, y marca los circuitos', () => {
      expect(resumir(FILA)).toEqual({
        id: 7,
        nombre: 'Línea 4001',
        numero_linea: '4001',
        empresa: 'COPAC LTDA.',
        tipo_servicio: 'urbano',
        variante: 'T',
        alternativo: false,
        circular: true,
        desde: 'Los Lirios',
        hasta: 'Doctor Eduardo Cordero',
        comunas: ['Puente Alto'],
        tiene_trazado: true,
      });
    });

    it('sin numero de linea usa el folio, y sin lugar usa la primera calle', () => {
      const r = resumir({ ...FILA, numero_linea: null, lugar_origen: null, tipo_trazado: 'alternativo', distancia_m: 120 });
      expect(r.nombre).toBe('Folio 234001');
      expect(r.desde).toBe('Los Lirios');
      expect(r.alternativo).toBe(true);
      expect(r.distancia_m).toBe(120);
    });
  });

  describe('agruparSentidos', () => {
    it('separa calles y puntos por sentido y omite un sentido vacio', () => {
      const sentidos = agruparSentidos(
        [
          { sentido: 'ida', orden: 1, calle: 'Los Lirios', comuna: 'Puente Alto' },
          { sentido: 'ida', orden: 2, calle: 'Av. Concha y Toro', comuna: 'Puente Alto' },
        ],
        [{ sentido: 'ida', orden: 1, latitud: -33.6, longitud: -70.57, distancia_acumulada_m: 0 }],
      );
      expect(sentidos).toHaveLength(1);
      expect(sentidos[0]?.calles.map((c) => c.calle)).toEqual(['Los Lirios', 'Av. Concha y Toro']);
      expect(sentidos[0]?.puntos).toEqual([{ latitud: -33.6, longitud: -70.57, distancia_acumulada_m: 0 }]);
    });
  });

  describe('CatalogoServicio', () => {
    const repositorio = {
      buscar: jest.fn().mockResolvedValue([FILA]),
      cercanas: jest.fn().mockResolvedValue([{ ...FILA, distancia_m: 85 }]),
      buscarPorId: jest.fn(),
      calles: jest.fn().mockResolvedValue([]),
      puntos: jest.fn().mockResolvedValue([]),
      comunas: jest.fn(),
    };
    const servicio = new CatalogoServicio(repositorio as unknown as CatalogoRepositorio);

    beforeEach(() => jest.clearAllMocks());

    it('busca con patrones escapados y la comuna sin espacios', async () => {
      await servicio.buscar('Concha 100%', ' Puente Alto ', 10);
      expect(repositorio.buscar).toHaveBeenCalledWith(['%concha%', '%100\\%%'], 'Puente Alto', 10);
    });

    it('sin texto ni comuna lista el catalogo con el limite por defecto', async () => {
      await servicio.buscar(undefined, undefined);
      expect(repositorio.buscar).toHaveBeenCalledWith([], null, 30);
    });

    it('cercanas usa 400 m si no se indica el radio', async () => {
      const lista = await servicio.cercanas(-33.6, -70.57);
      expect(repositorio.cercanas).toHaveBeenCalledWith(-33.6, -70.57, 400);
      expect(lista[0]?.distancia_m).toBe(85);
    });

    it('una linea que no existe responde 404', async () => {
      repositorio.buscarPorId.mockResolvedValueOnce(null);
      await expect(servicio.detalle(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el detalle trae folio, flota y sentidos', async () => {
      repositorio.buscarPorId.mockResolvedValueOnce(FILA);
      repositorio.calles.mockResolvedValueOnce([{ sentido: 'vuelta', orden: 1, calle: 'Av. Concha y Toro', comuna: 'Puente Alto' }]);
      const detalle = await servicio.detalle(7);
      expect(detalle.folio).toBe(234001);
      expect(detalle.flota_vigente).toBe(13);
      expect(detalle.sentidos.map((s) => s.sentido)).toEqual(['vuelta']);
    });
  });
});
