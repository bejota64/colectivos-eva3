import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CatalogoRepositorio, LineaFila } from './catalogo.repositorio';
import {
  agruparSentidos,
  ampliar,
  CatalogoServicio,
  type Coordenada,
  LIMITE_LINEAS_MAPA,
  lugarCorto,
  normalizar,
  palabras,
  patron,
  resumir,
  revisarRecuadro,
  simplificar,
  toleranciaPara,
  tramos,
} from './catalogo.servicio';

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

  describe('lineas en el mapa (funciones)', () => {
    // Zona de la Plaza de Puente Alto, unos 3 x 4 km.
    const ZONA = { sur: -33.625, oeste: -70.595, norte: -33.585, este: -70.555 };

    it('acepta un recuadro de barrio y rechaza uno invertido o demasiado grande', () => {
      expect(revisarRecuadro(ZONA)).toBeNull();
      expect(revisarRecuadro({ ...ZONA, sur: ZONA.norte, norte: ZONA.sur })).toMatch(/no es valido/);
      expect(revisarRecuadro({ sur: -33.8, oeste: -70.9, norte: -33.3, este: -70.4 })).toMatch(/Acerca el mapa/);
    });

    it('amplia el recuadro los metros pedidos por cada lado', () => {
      const r = ampliar(ZONA, 200);
      expect((ZONA.sur - r.sur) * 111_320).toBeCloseTo(200, 0);
      // En longitud el grado mide menos (por la latitud), asi que el margen en grados es mayor.
      expect(r.oeste).toBeLessThan(ZONA.oeste - 200 / 111_320);
    });

    it('la tolerancia crece con la zona visible, entre 5 y 30 m', () => {
      expect(toleranciaPara(ZONA)).toBeGreaterThanOrEqual(5);
      expect(toleranciaPara(ZONA)).toBeLessThan(10);
      expect(toleranciaPara({ sur: -33.6, oeste: -70.6, norte: -33.599, este: -70.599 })).toBe(5);
      expect(toleranciaPara({ sur: -33.7, oeste: -70.9, norte: -33.5, este: -70.5 })).toBe(30);
    });

    it('en una calle recta deja solo los extremos y conserva la esquina donde dobla', () => {
      const recta: Coordenada[] = [0, 1, 2, 3, 4].map((i) => [-33.6 + i * 0.0008, -70.58]);
      expect(simplificar(recta, 5)).toEqual([recta[0], recta[4]]);
      // Sube 4 cuadras y dobla 3 al oriente: la esquina (indice 4) se conserva.
      const esquina: Coordenada[] = [...recta, ...[1, 2, 3].map((i): Coordenada => [-33.5968, -70.58 + i * 0.0009])];
      const resultado = simplificar(esquina, 5);
      expect(resultado).toEqual([esquina[0], esquina[4], esquina[7]]);
    });

    it('no simplifica lineas de 2 puntos o menos', () => {
      const dos: Coordenada[] = [
        [-33.6, -70.58],
        [-33.59, -70.57],
      ];
      expect(simplificar(dos, 30)).toEqual(dos);
    });

    it('separa los tramos por sentido y cuando la linea sale del recuadro y vuelve', () => {
      const punto = (sentido: 'ida' | 'vuelta', orden: number) => ({ sentido, orden, latitud: -33.6 + orden * 0.001, longitud: -70.58 });
      const resultado = tramos(
        [punto('ida', 1), punto('ida', 2), punto('ida', 3), punto('ida', 7), punto('ida', 8), punto('vuelta', 1), punto('vuelta', 2), punto('vuelta', 5)],
        5,
      );
      expect(resultado.map((t) => [t.sentido, t.puntos.length])).toEqual([
        ['ida', 2],
        ['ida', 2],
        ['vuelta', 2],
      ]);
      // El punto suelto de la vuelta (orden 5) no alcanza para dibujar.
    });

    it('redondea a 5 decimales (un metro) para que la respuesta pese menos', () => {
      const [tramo] = tramos(
        [
          { sentido: 'ida', orden: 1, latitud: -33.6123456789, longitud: -70.5812345678 },
          { sentido: 'ida', orden: 2, latitud: -33.6012345678, longitud: -70.5798765432 },
        ],
        5,
      );
      expect(tramo?.puntos).toEqual([
        [-33.61235, -70.58123],
        [-33.60123, -70.57988],
      ]);
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
      enRecuadro: jest.fn().mockResolvedValue([]),
      puntosEnRecuadro: jest.fn().mockResolvedValue([]),
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

    it('el mapa rechaza un recuadro demasiado grande sin consultar la base', async () => {
      await expect(servicio.mapa({ sur: -34, oeste: -71, norte: -33, este: -70 })).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.enRecuadro).not.toHaveBeenCalled();
    });

    it('el mapa trae cada linea con su resumen y sus tramos, y avisa si hay mas del limite', async () => {
      repositorio.enRecuadro.mockResolvedValueOnce(Array.from({ length: LIMITE_LINEAS_MAPA + 1 }, (_, i) => ({ ...FILA, id: i + 1 })));
      repositorio.puntosEnRecuadro.mockResolvedValueOnce([
        { linea_id: 1, sentido: 'ida', orden: 4, latitud: -33.6, longitud: -70.58 },
        { linea_id: 1, sentido: 'ida', orden: 5, latitud: -33.599, longitud: -70.58 },
      ]);
      const recuadro = { sur: -33.625, oeste: -70.595, norte: -33.585, este: -70.555 };
      const mapa = await servicio.mapa(recuadro);
      expect(repositorio.enRecuadro).toHaveBeenCalledWith(recuadro, LIMITE_LINEAS_MAPA + 1);
      expect(mapa.recortado).toBe(true);
      expect(mapa.lineas).toHaveLength(LIMITE_LINEAS_MAPA);
      expect(mapa.lineas[0]).toMatchObject({ id: 1, nombre: 'Línea 4001', desde: 'Los Lirios', circular: true });
      expect(mapa.lineas[0]?.tramos).toEqual([
        {
          sentido: 'ida',
          puntos: [
            [-33.6, -70.58],
            [-33.599, -70.58],
          ],
        },
      ]);
      expect(mapa.lineas[1]?.tramos).toEqual([]);
      // Los puntos se piden con margen, para que las lineas lleguen al borde del mapa.
      const [ids, conMargen] = repositorio.puntosEnRecuadro.mock.calls[0] as [number[], typeof recuadro];
      expect(ids).toHaveLength(LIMITE_LINEAS_MAPA);
      expect(conMargen.sur).toBeLessThan(recuadro.sur);
      expect(conMargen.este).toBeGreaterThan(recuadro.este);
    });

    it('sin lineas en la zona no pide puntos', async () => {
      const mapa = await servicio.mapa({ sur: -33.625, oeste: -70.595, norte: -33.585, este: -70.555 });
      expect(mapa).toEqual({ lineas: [], recortado: false });
      expect(repositorio.puntosEnRecuadro).not.toHaveBeenCalled();
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
