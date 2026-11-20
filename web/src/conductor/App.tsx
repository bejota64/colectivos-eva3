/**
 * App del conductor. Tema oscuro (se usa de noche y dentro del auto) y
 * botones enormes: se toca con el auto detenido, sin mirar mucho rato.
 */
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { api, ErrorApi } from '../comun/api';
import { Dialogo } from '../comun/componentes/Dialogo';
import { FormularioAcceso } from '../comun/componentes/FormularioAcceso';
import { Cordillera, IlustracionColectivo } from '../comun/componentes/Ilustraciones';
import { Marca } from '../comun/componentes/Letrero';
import { Cargando, OtraApp } from '../comun/componentes/OtraApp';
import { iniciales } from '../comun/formato';
import { useDatos } from '../comun/ganchos';
import { useSesion, useUsuario } from '../comun/sesion';
import type { Jornada, Trazado } from '../comun/tipos';
import { EnServicio } from './EnServicio';
import { IniciarJornada } from './IniciarJornada';

export function App() {
  const { estado } = useSesion();
  if (estado.tipo === 'cargando') {
    return <Cargando />;
  }
  if (estado.tipo === 'sin-sesion') {
    return <Acceso />;
  }
  if (estado.usuario.rol !== 'conductor') {
    return <OtraApp rol={estado.usuario.rol} oscura />;
  }
  return <Conductor />;
}

function Acceso() {
  return (
    <main className="c-acceso">
      <Marca app="Conductor" oscura />
      <div className="c-acceso-escena" aria-hidden="true">
        <Cordillera className="c-acceso-cordillera" />
        <IlustracionColectivo className="c-acceso-colectivo" />
      </div>
      <div className="c-acceso-texto">
        <h1>Entra para iniciar tu jornada</h1>
        <p>Usa el correo y la contraseña que te entregó el representante de tu trazado.</p>
      </div>
      <FormularioAcceso textoBoton="Entrar" />
    </main>
  );
}

type EstadoJornada =
  | { tipo: 'sin-jornada'; aviso?: string }
  | { tipo: 'en-servicio'; jornada: Jornada }
  | { tipo: 'terminada'; jornada: Jornada; terminadaEn: number; motivo: string };

function Conductor() {
  const trazados = useDatos(() => api<Trazado[]>('/trazados'), 'trazados');
  const [estado, setEstado] = useState<EstadoJornada | null>(null);

  // Jornada abierta al entrar: si el telefono se apago a mitad del turno, se retoma.
  const actual = useDatos(async () => {
    try {
      return await api<Jornada>('/jornadas/actual');
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 409) return null;
      throw e;
    }
  }, 'jornada-actual');

  const vista: EstadoJornada | null =
    estado ?? (actual.datos === undefined ? null : actual.datos ? { tipo: 'en-servicio', jornada: actual.datos } : { tipo: 'sin-jornada' });

  return (
    <div className="c-app">
      <BarraConductor />
      {actual.error && !vista && (
        <p className="mensaje mensaje-error c-margen" role="alert">
          {actual.error}
        </p>
      )}
      {!vista && !actual.error && <Cargando texto="Revisando tu jornada…" />}
      {vista?.tipo === 'sin-jornada' && (
        <IniciarJornada
          trazados={trazados.datos ?? []}
          aviso={vista.aviso}
          alIniciar={(jornada) => setEstado({ tipo: 'en-servicio', jornada })}
        />
      )}
      {vista?.tipo === 'en-servicio' && (
        <EnServicio
          jornada={vista.jornada}
          trazados={trazados.datos ?? []}
          alCambiar={(jornada) => setEstado({ tipo: 'en-servicio', jornada })}
          alTerminar={(motivo) => setEstado({ tipo: 'terminada', jornada: vista.jornada, terminadaEn: Date.now(), motivo })}
        />
      )}
      {vista?.tipo === 'terminada' && (
        <JornadaTerminada
          jornada={vista.jornada}
          terminadaEn={vista.terminadaEn}
          motivo={vista.motivo}
          alContinuar={() => setEstado({ tipo: 'sin-jornada' })}
        />
      )}
    </div>
  );
}

function BarraConductor() {
  const usuario = useUsuario();
  const { salir } = useSesion();
  const [verMenu, setVerMenu] = useState(false);
  return (
    <header className="c-barra">
      <Marca app="Conductor" oscura />
      <button type="button" className="c-avatar" onClick={() => setVerMenu(true)} aria-label="Menú de la cuenta">
        {iniciales(usuario.nombre_completo)}
      </button>
      <Dialogo
        abierto={verMenu}
        alCerrar={() => setVerMenu(false)}
        titulo={usuario.nombre_completo}
        descripcion={<p>{usuario.correo_electronico}</p>}
      >
        <p className="c-nota">
          Si cierras sesión con una jornada abierta, la jornada sigue abierta. Termínala antes si ya no vas a trabajar.
        </p>
        <button type="button" className="boton boton-secundario boton-ancho" onClick={() => void salir()}>
          <LogOut size={20} aria-hidden="true" />
          Cerrar sesión
        </button>
      </Dialogo>
    </header>
  );
}

function JornadaTerminada({
  jornada,
  terminadaEn,
  motivo,
  alContinuar,
}: {
  jornada: Jornada;
  terminadaEn: number;
  motivo: string;
  alContinuar(): void;
}) {
  const minutos = Math.max(0, Math.round((terminadaEn - new Date(jornada.iniciada_en).getTime()) / 60_000));
  const horas = Math.floor(minutos / 60);
  return (
    <main className="c-terminada">
      <div className="c-terminada-cifra">
        <b>{horas > 0 ? `${horas} h ${minutos % 60}` : minutos}</b>
        <span>{horas > 0 ? 'min de jornada' : 'minutos de jornada'}</span>
      </div>
      <h1>{motivo}</h1>
      <p>
        {motivo === 'Jornada terminada'
          ? 'Los pasajeros ya no ven tu colectivo en el mapa.'
          : 'La cerró el representante del trazado o se cerró sola tras 30 minutos sin señal GPS. Los pasajeros ya no ven tu colectivo en el mapa.'}{' '}
        El auto <span className="patente">{jornada.patente}</span> quedó libre.
      </p>
      <button type="button" className="boton boton-principal boton-ancho boton-grande" onClick={alContinuar}>
        Abrir una nueva jornada
      </button>
    </main>
  );
}
