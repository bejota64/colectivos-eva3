/**
 * Guia de cuatro pasos la primera vez que alguien entra. Se puede volver a ver
 * desde el menu («¿Cómo funciona?»). Que ya se vio se recuerda solo en este
 * navegador.
 */
import { useState } from 'react';
import { BusFront, Hand, MapPin, Star } from 'lucide-react';
import { Dialogo } from '../comun/componentes/Dialogo';
import { preferencias } from '../comun/geo';

const PASOS = [
  {
    Icono: MapPin,
    titulo: 'Elige hacia dónde vas',
    texto: 'Arriba eliges el sentido. En el mapa ves los colectivos que vienen: el número es cuántos asientos libres traen.',
  },
  {
    Icono: Hand,
    titulo: 'Toca «Estoy esperando»',
    texto: 'Los conductores que vienen ven que hay gente esperando en tu cuadra. No tienes que hacer nada más: espera en la calle del recorrido.',
  },
  {
    Icono: BusFront,
    titulo: 'Al subir, toca «Me subí»',
    texto: 'El pago es en efectivo al conductor, como siempre. La tarifa está arriba del botón.',
  },
  {
    Icono: Star,
    titulo: 'Al bajar, toca «Ya bajé»',
    texto: 'Puedes calificar el viaje, felicitar al conductor o reportar un problema. El conductor no sabe quién lo escribió.',
  },
];

export function guiaVista(): boolean {
  return preferencias.leer('guia') === 'vista';
}

export function Guia({ abierta, alCerrar }: { abierta: boolean; alCerrar(): void }) {
  const [paso, setPaso] = useState(0);
  const actual = PASOS[paso] ?? PASOS[0];
  const ultimo = paso === PASOS.length - 1;

  function cerrar() {
    preferencias.guardar('guia', 'vista');
    setPaso(0);
    alCerrar();
  }

  if (!actual) return null;
  const { Icono } = actual;
  return (
    <Dialogo abierto={abierta} alCerrar={cerrar} titulo="Así funciona">
      <div className="guia">
        <span className="guia-icono" aria-hidden="true">
          <Icono size={34} />
        </span>
        <p className="guia-paso">
          Paso {paso + 1} de {PASOS.length}
        </p>
        <h3>{actual.titulo}</h3>
        <p>{actual.texto}</p>
        <div className="guia-puntos" aria-hidden="true">
          {PASOS.map((p, i) => (
            <i key={p.titulo} className={i === paso ? 'activo' : ''} />
          ))}
        </div>
      </div>
      <div className="dialogo-acciones">
        <button
          type="button"
          className="boton boton-principal boton-ancho boton-grande"
          onClick={() => (ultimo ? cerrar() : setPaso((p) => p + 1))}
        >
          {ultimo ? 'Entendido' : 'Siguiente'}
        </button>
        {!ultimo && (
          <button type="button" className="boton boton-texto" onClick={cerrar}>
            Saltar
          </button>
        )}
      </div>
    </Dialogo>
  );
}
