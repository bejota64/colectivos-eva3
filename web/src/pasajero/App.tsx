import { Navigate, Route, Routes } from 'react-router';
import { Cargando, OtraApp } from '../comun/componentes/OtraApp';
import { useSesion } from '../comun/sesion';
import { Acceso } from './Acceso';
import { Cuenta } from './Cuenta';
import { Inicio } from './Inicio';
import { Recorrido } from './Recorrido';
import { Recorridos } from './Recorridos';
import { Viajes } from './Viajes';

export function App() {
  const { estado } = useSesion();
  if (estado.tipo === 'cargando') {
    return <Cargando />;
  }
  if (estado.tipo === 'sin-sesion') {
    return <Acceso />;
  }
  if (estado.usuario.rol !== 'pasajero') {
    return <OtraApp rol={estado.usuario.rol} />;
  }
  return (
    <Routes>
      <Route index element={<Inicio />} />
      <Route path="viajes" element={<Viajes />} />
      <Route path="cuenta" element={<Cuenta />} />
      <Route path="recorridos" element={<Recorridos />} />
      <Route path="recorridos/:id" element={<Recorrido />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
