// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POLITICA_CONTENIDO } from '../politica-contenido';

// El Caddyfile llega al repositorio con la parte del despliegue, despues de la web:
// mientras no exista, esta comparacion se omite (y queda marcada como omitida).
const CADDYFILE = resolve(import.meta.dirname, '../../despliegue/Caddyfile');

describe('politica de seguridad de contenido', () => {
  it.skipIf(!existsSync(CADDYFILE))('la de las pruebas es la misma que pone Caddy en produccion', () => {
    const caddyfile = readFileSync(CADDYFILE, 'utf8');
    const enCaddy = /Content-Security-Policy "([^"]+)"/.exec(caddyfile)?.[1];
    expect(enCaddy).toBe(POLITICA_CONTENIDO);
  });

  it('no permite scripts en linea ni de otros sitios', () => {
    expect(POLITICA_CONTENIDO).toContain("script-src 'self';");
    expect(POLITICA_CONTENIDO).not.toContain('unsafe-inline');
    expect(POLITICA_CONTENIDO).not.toContain('unsafe-eval');
    expect(POLITICA_CONTENIDO).toContain("frame-ancestors 'none'");
  });
});
