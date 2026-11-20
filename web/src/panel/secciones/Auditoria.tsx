/**
 * Registro de auditoria (CU-14): quien hizo que y cuando. Solo lectura y
 * solo para el administrador. Es la evidencia ante un acceso ilicito
 * (Ley 21.459), por eso la API no ofrece forma de borrarlo.
 */
import { useState } from 'react';
import { api } from '../../comun/api';
import { MensajeError } from '../../comun/componentes/Formulario';
import { formatoFechaCorta, formatoHora, NOMBRE_EVENTO } from '../../comun/formato';
import { useDatos } from '../../comun/ganchos';
import type { PaginaAuditoria, TipoEvento } from '../../comun/tipos';
import { Encabezado } from '../App';

const TIPOS = Object.keys(NOMBRE_EVENTO) as TipoEvento[];
const ALERTA: TipoEvento[] = ['inicio_sesion_fallido', 'acceso_denegado'];

function detalleLegible(detalle: Record<string, unknown> | undefined): string {
  if (!detalle) return '';
  return Object.entries(detalle)
    .map(([clave, valor]) => `${clave.replaceAll('_', ' ')}: ${typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`)
    .join('; ');
}

export function Auditoria() {
  const [tipo, setTipo] = useState<TipoEvento | ''>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const eventos = useDatos(
    () => api<PaginaAuditoria>('/auditoria', { consulta: { tipo: tipo || undefined, desde, hasta, pagina } }),
    `${tipo}:${desde}:${hasta}:${pagina}`,
  );
  const lista = eventos.datos?.eventos ?? [];
  const hayMas = lista.length === (eventos.datos?.por_pagina ?? 50);

  function filtrar(cambio: () => void) {
    cambio();
    setPagina(1);
  }

  return (
    <div className="p-seccion">
      <Encabezado titulo="Auditoría" detalle="Inicios de sesión, accesos denegados y cambios hechos en el sistema. No se puede modificar ni borrar." />
      <div className="p-filtros">
        <label className="p-filtro">
          <span>Evento</span>
          <select className="entrada" value={tipo} onChange={(e) => filtrar(() => setTipo(e.target.value as TipoEvento | ''))}>
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {NOMBRE_EVENTO[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="p-filtro">
          <span>Desde</span>
          <input type="date" className="entrada" value={desde} onChange={(e) => filtrar(() => setDesde(e.target.value))} />
        </label>
        <label className="p-filtro">
          <span>Hasta</span>
          <input type="date" className="entrada" value={hasta} onChange={(e) => filtrar(() => setHasta(e.target.value))} />
        </label>
      </div>
      <MensajeError>{eventos.error}</MensajeError>

      <section className="p-tarjeta" aria-label="Eventos">
        {eventos.datos && lista.length === 0 && <p className="p-nada">No hay eventos con esos filtros.</p>}
        {lista.length > 0 && (
          <div className="p-tabla-contenedor">
            <table className="p-tabla p-tabla-auditoria">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Evento</th>
                  <th scope="col">Usuario</th>
                  <th scope="col">IP</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e, i) => (
                  <tr key={`${e.ocurrido_en}-${i}`}>
                    <td className="p-sin-salto">
                      {formatoFechaCorta(e.ocurrido_en)}, {formatoHora(e.ocurrido_en)}
                    </td>
                    <td>
                      <span className={`pildora ${ALERTA.includes(e.tipo) ? 'pildora-rojo' : 'pildora-gris'}`}>{NOMBRE_EVENTO[e.tipo]}</span>
                    </td>
                    <td className="p-codigo" title={e.usuario_id ?? undefined}>
                      {e.usuario_id ? `…${e.usuario_id.slice(-8)}` : 'Sin sesión'}
                    </td>
                    <td className="p-codigo">{e.direccion_ip ?? ''}</td>
                    <td className="p-detalle-evento">{detalleLegible(e.detalle)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav className="p-paginas" aria-label="Páginas">
          <button type="button" className="boton boton-secundario p-boton-chico" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>
            Más recientes
          </button>
          <span>Página {pagina}</span>
          <button type="button" className="boton boton-secundario p-boton-chico" disabled={!hayMas} onClick={() => setPagina((p) => p + 1)}>
            Más antiguos
          </button>
        </nav>
      </section>
    </div>
  );
}
