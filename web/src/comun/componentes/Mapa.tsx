/**
 * Mapa del recorrido con Leaflet y OpenStreetMap.
 *
 * - Las teselas se muestran en grises para que el recorrido (negro con
 *   linea amarilla) y los colectivos (letreros amarillos) sean lo unico
 *   con color.
 * - Los marcadores son HTML con clases, sin estilos en linea: asi la
 *   politica de seguridad de contenido (CSP) puede prohibirlos.
 */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { AttributionControl, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import type { ColectivoEnRuta, PuntoRuta } from '../tipos';

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
}: Props) {
  const linea = useMemo(() => recorrido.map((p) => [p.latitud, p.longitud] as [number, number]), [recorrido]);

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
    </MapContainer>
  );
}
