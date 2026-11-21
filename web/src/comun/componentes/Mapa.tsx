/**
 * Mapa del recorrido con Leaflet y OpenStreetMap.
 *
 * - Las teselas se muestran en grises para que el recorrido (negro con
 *   linea amarilla) y los colectivos (letreros amarillos) sean lo unico
 *   con color.
 * - Los marcadores son HTML con clases, sin estilos en linea: asi la
 *   politica de seguridad de contenido (CSP) puede prohibirlos.
 * - Debajo de todo, si se piden, las lineas del catalogo que pasan por la
 *   zona (finas y apagadas). Al tocar el mapa se avisa que lineas pasan
 *   cerca del dedo; la elegida se resalta: ida gruesa en azul, vuelta fina
 *   en morado encima (donde van por la misma calle se ven las dos).
 */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { AttributionControl, MapContainer, Marker, Pane, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { lineasTocadas } from '../geo';
import type { ColectivoEnRuta, Coordenada, LineaMapa, NombreSentido, PuntoRuta, Recuadro } from '../tipos';

const PUENTE_ALTO: [number, number] = [-33.6117, -70.5758];

export interface Espera {
  clave: string;
  latitud: number;
  longitud: number;
  personas: number;
}

interface Props {
  recorrido: PuntoRuta[];
  colectivos?: ColectivoEnRuta[];
  miUbicacion?: { latitud: number; longitud: number } | null;
  esperas?: Espera[];
  seleccionado?: string | null;
  alSeleccionar?(jornadaId: string): void;
  /** Espacio que tapan otros elementos (letrero, hoja inferior o panel lateral), para encuadrar el recorrido en lo visible. */
  margenSuperior?: number;
  margenInferior?: number;
  margenIzquierdo?: number;
  controlesZoom?: boolean;
  className?: string;
  /** Lineas del catalogo que pasan por la zona visible. */
  lineas?: LineaMapa[];
  /** Linea elegida, completa y por sentido, para resaltarla. */
  lineaResaltada?: { sentido: NombreSentido; puntos: Coordenada[] }[] | null;
  /** Al tocar el mapa: las lineas que pasan cerca del dedo (vacio si ninguna). */
  alTocarLineas?(lineas: LineaMapa[]): void;
  /** Cada vez que el mapa termina de moverse: lo visible (con un margen) y el zoom. */
  alMoverse?(vista: { recuadro: Recuadro; zoom: number }): void;
  /** Encuadra estos puntos cuando cambia la clave (la linea elegida, o un solo punto: mi ubicacion). */
  enfocar?: { clave: string; puntos: Coordenada[] } | null;
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Marcador del colectivo: un letrero con el NUMERO DE ASIENTOS LIBRES y una
 * franja del color del nivel (verde, ambar el ultimo, rojo completo). Es la
 * convencion validada en el prototipo de la EVA 2, con su leyenda en el mapa.
 */
function iconoColectivo(colectivo: ColectivoEnRuta, seleccionado: boolean): L.DivIcon {
  const libres = Math.max(0, colectivo.asientos_disponibles);
  const nivel = libres === 0 ? 'completo' : libres === 1 ? 'ultimo' : 'disponible';
  const clases = ['marcador-colectivo', `nivel-${nivel}`, colectivo.atenuado ? 'atenuado' : '', seleccionado ? 'seleccionado' : '']
    .filter(Boolean)
    .join(' ');
  return L.divIcon({
    className: 'marcador-contenedor',
    html: `<div class="${clases}"><b>${libres}</b><span>${escapar(colectivo.patente)}</span></div>`,
    iconSize: [60, 50],
    iconAnchor: [30, 50],
  });
}

const ICONO_YO = L.divIcon({
  className: 'marcador-contenedor',
  html: '<span class="marcador-yo"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function iconoEspera(personas: number): L.DivIcon {
  return L.divIcon({
    className: 'marcador-contenedor',
    html: `<span class="marcador-espera">${personas}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

interface Margenes {
  margenSuperior: number;
  margenInferior: number;
  margenIzquierdo: number;
}

function AjustarVista({ recorrido, margenSuperior, margenInferior, margenIzquierdo }: { recorrido: PuntoRuta[] } & Margenes) {
  const mapa = useMap();
  // El arreglo del recorrido cambia solo cuando se carga otro sentido (no en
  // cada actualizacion de colectivos), asi que el mapa no "salta" al usarlo.
  useEffect(() => {
    if (recorrido.length < 2) return;
    const limites = L.latLngBounds(recorrido.map((p) => [p.latitud, p.longitud] as [number, number]));
    mapa.fitBounds(limites, {
      paddingTopLeft: [margenIzquierdo + 24, margenSuperior + 24],
      paddingBottomRight: [24, margenInferior + 24],
      animate: false,
    });
  }, [mapa, recorrido, margenSuperior, margenInferior, margenIzquierdo]);
  return null;
}

/** Avisa lo visible al terminar cada movimiento, y una vez al cargar. */
function ObservarVista({ alMoverse }: { alMoverse(vista: { recuadro: Recuadro; zoom: number }): void }) {
  const avisar = useRef(alMoverse);
  useEffect(() => {
    avisar.current = alMoverse;
  });
  const mapa = useMapEvents({
    moveend: () => emitir(),
  });
  function emitir() {
    // 10 % de margen: al mover un poco el mapa, las lineas ya estan.
    const limites = mapa.getBounds().pad(0.1);
    avisar.current({
      recuadro: { sur: limites.getSouth(), oeste: limites.getWest(), norte: limites.getNorth(), este: limites.getEast() },
      zoom: mapa.getZoom(),
    });
  }
  useEffect(() => {
    mapa.whenReady(() => emitir());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [mapa]);
  return null;
}

function TocarLineas({ lineas, alTocar }: { lineas: LineaMapa[]; alTocar(lineas: LineaMapa[]): void }) {
  const actuales = useRef({ lineas, alTocar });
  useEffect(() => {
    actuales.current = { lineas, alTocar };
  });
  const mapa = useMapEvents({
    click: (evento) => {
      const { lineas: visibles, alTocar: avisar } = actuales.current;
      const toque = evento.containerPoint;
      avisar(lineasTocadas(visibles, toque, ([lat, lon]) => mapa.latLngToContainerPoint([lat, lon])));
    },
  });
  return null;
}

function Enfocar({ enfocar, margenSuperior, margenInferior, margenIzquierdo }: { enfocar: { clave: string; puntos: Coordenada[] } } & Margenes) {
  const mapa = useMap();
  const { clave, puntos } = enfocar;
  useEffect(() => {
    const [unico] = puntos;
    if (!unico) return;
    // Un solo punto (por ejemplo «mi ubicación»): una cuadra a la redonda.
    const limites = puntos.length === 1 ? L.latLng(unico).toBounds(400) : L.latLngBounds(puntos);
    mapa.fitBounds(limites, {
      paddingTopLeft: [margenIzquierdo + 24, margenSuperior + 24],
      paddingBottomRight: [24, margenInferior + 24],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la clave
  }, [mapa, clave]);
  return null;
}

// Colores y grosores (se pueden cambiar despues). La clase y «interactive»
// van como props: Leaflet solo los toma al crear la linea.
const ESTILO_LINEA = { color: '#3d5480', weight: 2.5, opacity: 0.5 } as const;
const ESTILO_LINEA_TENUE = { ...ESTILO_LINEA, opacity: 0.22 } as const;
const ESTILO_IDA_BORDE = { color: '#ffffff', weight: 10, opacity: 0.9, lineCap: 'round' } as const;
const ESTILO_IDA = { color: '#1d4ed8', weight: 6, opacity: 1, lineCap: 'round' } as const;
const ESTILO_VUELTA = { color: '#7e22ce', weight: 3, opacity: 1, lineCap: 'round' } as const;

export function Mapa({
  recorrido,
  colectivos = [],
  miUbicacion,
  esperas = [],
  seleccionado,
  alSeleccionar,
  margenSuperior = 0,
  margenInferior = 0,
  margenIzquierdo = 0,
  controlesZoom = false,
  className,
  lineas = [],
  lineaResaltada = null,
  alTocarLineas,
  alMoverse,
  enfocar = null,
}: Props) {
  const linea = useMemo(() => recorrido.map((p) => [p.latitud, p.longitud] as [number, number]), [recorrido]);
  // Las posiciones se arman una vez por respuesta, no en cada actualizacion de colectivos.
  const capas = useMemo(() => lineas.map((l) => ({ id: l.id, posiciones: l.tramos.map((t) => t.puntos) })), [lineas]);
  const ida = lineaResaltada?.filter((s) => s.sentido === 'ida').map((s) => s.puntos) ?? [];
  const vuelta = lineaResaltada?.filter((s) => s.sentido === 'vuelta').map((s) => s.puntos) ?? [];

  return (
    <MapContainer
      className={`mapa ${className ?? ''}`}
      center={PUENTE_ALTO}
      zoom={14}
      zoomControl={controlesZoom}
      zoomSnap={0.25}
      attributionControl={false}
      scrollWheelZoom={controlesZoom}
    >
      <AttributionControl prefix={false} />
      <TileLayer
        className="teselas"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      {/* Debajo del recorrido de la app (400) y de los colectivos. */}
      <Pane name="lineas" className="mapa-capa-lineas">
        {capas.map((capa) => (
          <Polyline
            key={capa.id}
            positions={capa.posiciones}
            pathOptions={lineaResaltada ? ESTILO_LINEA_TENUE : ESTILO_LINEA}
            className="linea-catalogo"
            interactive={false}
          />
        ))}
      </Pane>
      {lineaResaltada && (
        <Pane name="linea-resaltada" className="mapa-capa-resaltada">
          {ida.length > 0 && <Polyline positions={ida} pathOptions={ESTILO_IDA_BORDE} interactive={false} />}
          {ida.length > 0 && <Polyline positions={ida} pathOptions={ESTILO_IDA} className="linea-resaltada-ida" interactive={false} />}
          {vuelta.length > 0 && (
            <Polyline positions={vuelta} pathOptions={ESTILO_VUELTA} className="linea-resaltada-vuelta" interactive={false} />
          )}
        </Pane>
      )}
      {linea.length > 1 && (
        <>
          <Polyline positions={linea} pathOptions={{ color: '#1f2023', weight: 8, opacity: 0.9, lineCap: 'round' }} />
          <Polyline positions={linea} pathOptions={{ color: '#ffc72c', weight: 2.5, opacity: 1, dashArray: '8 10' }} />
        </>
      )}
      {esperas.map((espera) => (
        <Marker
          key={espera.clave}
          position={[espera.latitud, espera.longitud]}
          icon={iconoEspera(espera.personas)}
          title={`${espera.personas} ${espera.personas === 1 ? 'persona espera' : 'personas esperan'}`}
        />
      ))}
      {miUbicacion && (
        <Marker position={[miUbicacion.latitud, miUbicacion.longitud]} icon={ICONO_YO} title="Tu ubicación" zIndexOffset={500} />
      )}
      {colectivos.map((colectivo) => (
        <Marker
          key={colectivo.jornada_id}
          position={[colectivo.latitud, colectivo.longitud]}
          icon={iconoColectivo(colectivo, colectivo.jornada_id === seleccionado)}
          title={`Colectivo ${colectivo.patente}: ${colectivo.asientos_disponibles} asientos libres`}
          zIndexOffset={colectivo.jornada_id === seleccionado ? 1000 : 0}
          eventHandlers={alSeleccionar ? { click: () => alSeleccionar(colectivo.jornada_id) } : undefined}
        />
      ))}
      <AjustarVista
        recorrido={recorrido}
        margenSuperior={margenSuperior}
        margenInferior={margenInferior}
        margenIzquierdo={margenIzquierdo}
      />
      {alMoverse && <ObservarVista alMoverse={alMoverse} />}
      {alTocarLineas && <TocarLineas lineas={lineas} alTocar={alTocarLineas} />}
      {enfocar && (
        <Enfocar enfocar={enfocar} margenSuperior={margenSuperior} margenInferior={margenInferior} margenIzquierdo={margenIzquierdo} />
      )}
    </MapContainer>
  );
}
