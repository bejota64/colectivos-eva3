/** CU-07: el conductor elige auto y sentido y abre su jornada. */
import { useState, type FormEvent } from 'react';
import { CarFront } from 'lucide-react';
import { api, ErrorApi } from '../comun/api';
import { OpcionRadio } from '../comun/componentes/OpcionRadio';
import { Dialogo } from '../comun/componentes/Dialogo';
import { MensajeError } from '../comun/componentes/Formulario';
import { Patente } from '../comun/componentes/Letrero';
import { primerNombre } from '../comun/formato';
import { textoDeError, useDatos } from '../comun/ganchos';
import { useUsuario } from '../comun/sesion';
import type { Jornada, Trazado, VehiculoDisponible } from '../comun/tipos';

const MENSAJE_SIN_CONSENTIMIENTO = 'Debes aceptar el uso de tu ubicacion';

interface Props {
  trazados: Trazado[];
  aviso?: string;
  alIniciar(jornada: Jornada): void;
}

export function IniciarJornada({ trazados, aviso, alIniciar }: Props) {
  const usuario = useUsuario();
  const vehiculos = useDatos(() => api<VehiculoDisponible[]>('/flota/vehiculos-disponibles'), 'vehiculos');
  const [vehiculoId, setVehiculoId] = useState('');
  const [sentidoId, setSentidoId] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verConsentimiento, setVerConsentimiento] = useState(false);

  const variosTrazados = trazados.length > 1;

  async function iniciar() {
    setEnviando(true);
    setError('');
    try {
      const jornada = await api<Jornada>('/jornadas', {
        metodo: 'POST',
        cuerpo: { vehiculo_id: vehiculoId, sentido_id: sentidoId },
      });
      alIniciar(jornada);
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 403 && e.message.startsWith(MENSAJE_SIN_CONSENTIMIENTO)) {
        setVerConsentimiento(true);
      } else {
        setError(textoDeError(e));
        if (e instanceof ErrorApi && e.estado === 409) vehiculos.recargar();
      }
      setEnviando(false);
    }
  }

  async function aceptarYIniciar() {
    try {
      await api('/usuarios/yo/consentimientos/geolocalizacion', { metodo: 'POST' });
      setVerConsentimiento(false);
      await iniciar();
    } catch (e) {
      setError(textoDeError(e));
      setVerConsentimiento(false);
    }
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    void iniciar();
  }

  return (
    <main className="c-iniciar">
      <div className="c-saludo">
        <h1>Hola, {primerNombre(usuario.nombre_completo)}</h1>
        <p>Elige el auto y el sentido para empezar.</p>
      </div>
      {aviso && <p className="mensaje mensaje-aviso">{aviso}</p>}

      <form className="c-formulario" onSubmit={enviar}>
        <fieldset className="c-grupo">
          <legend>
            <span className="c-paso">1</span>
            Tu auto
          </legend>
          <MensajeError>{vehiculos.error}</MensajeError>
          {vehiculos.datos?.length === 0 && (
            <div className="c-vacio">
              <CarFront size={28} aria-hidden="true" />
              <p>No hay autos libres. Todos están en uso o inactivos: avisa al representante del trazado.</p>
            </div>
          )}
          <div className="c-opciones" role="radiogroup" aria-label="Tu auto">
            {vehiculos.datos?.map((v, i) => (
              <OpcionRadio
                key={v.id}
                className="c-opcion"
                marcada={vehiculoId === v.id}
                enfocable={!vehiculoId && i === 0}
                alElegir={() => setVehiculoId(v.id)}
              >
                <Patente>{v.patente}</Patente>
                <span className="c-opcion-texto">
                  <b>
                    {v.marca} {v.modelo}
                  </b>
                  <span>{v.capacidad} asientos</span>
                </span>
              </OpcionRadio>
            ))}
          </div>
        </fieldset>

        <fieldset className="c-grupo">
          <legend>
            <span className="c-paso">2</span>
            ¿Hacia dónde partes?
          </legend>
          <div className="c-opciones" role="radiogroup" aria-label="¿Hacia dónde partes?">
            {trazados.flatMap((t, it) =>
              t.sentidos.map((s, is) => (
                <OpcionRadio
                  key={s.id}
                  className="c-opcion c-opcion-sentido"
                  etiqueta={`Hacia ${s.destino}, desde ${s.origen}`}
                  marcada={sentidoId === s.id}
                  enfocable={!sentidoId && it === 0 && is === 0}
                  alElegir={() => setSentidoId(s.id)}
                >
                  <span className="c-ruta" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                  <span className="c-opcion-texto">
                    <span>
                      {variosTrazados ? `${t.codigo}, desde ` : 'Desde '}
                      {s.origen}
                    </span>
                    <b>Hacia {s.destino}</b>
                  </span>
                </OpcionRadio>
              )),
            )}
          </div>
        </fieldset>

        <MensajeError>{error}</MensajeError>
        <button
          type="submit"
          className="boton boton-principal boton-ancho boton-grande"
          disabled={enviando || !vehiculoId || !sentidoId}
        >
          {enviando ? 'Iniciando…' : 'Iniciar jornada'}
        </button>
      </form>

      <Dialogo
        abierto={verConsentimiento}
        alCerrar={() => setVerConsentimiento(false)}
        titulo="Tu ubicación durante la jornada"
        descripcion={
          <p>
            Mientras tu jornada está abierta, la app envía la posición del auto cada 5 segundos. Así los pasajeros ven
            dónde vienes y cuánto falta.
          </p>
        }
      >
        <ul className="c-lista">
          <li>Solo durante la jornada: al terminarla se deja de enviar.</li>
          <li>Los pasajeros ven el auto en el mapa, no tu nombre.</li>
          <li>Puedes retirar el permiso, pero sin él no se puede abrir una jornada.</li>
        </ul>
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-principal boton-ancho" onClick={() => void aceptarYIniciar()}>
            Aceptar e iniciar jornada
          </button>
          <button type="button" className="boton boton-texto" onClick={() => setVerConsentimiento(false)}>
            Ahora no
          </button>
        </div>
      </Dialogo>
    </main>
  );
}
