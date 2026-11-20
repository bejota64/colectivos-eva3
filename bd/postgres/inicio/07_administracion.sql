-- =====================================================================
-- Administracion desde el panel (CU-13): el administrador crea trazados y
-- representantes sin entrar al servidor.
--
-- La cuenta de la API sigue sin poder crear cuentas con privilegios ni
-- trazados por su cuenta:
--   1. Un trigger rechaza cualquier INSERT de un usuario representante o
--      administrador que no venga de la cuenta duena de la base.
--   2. Lo unico que la API puede hacer es llamar a estas funciones
--      (SECURITY DEFINER: corren con la cuenta duena), que exigen un
--      administrador activo y validan cada dato antes de escribir.
-- Asi, aunque alguien tomara el control de la cuenta de la API, no podria
-- crear un administrador, y para crear un representante tendria que pasar
-- por la misma validacion que el panel. La API registra cada accion en la
-- auditoria (MongoDB).
--
-- Los administradores se siguen creando solo por script, con la cuenta
-- duena (bd/postgres/administracion).
-- =====================================================================

\set ON_ERROR_STOP on
\getenv api_usuario POSTGRES_API_USUARIO

-- ---------------------------------------------------------------------
-- 1. Solo la cuenta duena crea representantes y administradores
-- ---------------------------------------------------------------------
CREATE FUNCTION usuarios_exigir_dueno_para_privilegiados()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.rol IN ('representante', 'administrador')
       AND NOT pg_has_role(current_user,
                           (SELECT relowner FROM pg_class WHERE oid = 'public.usuarios'::regclass),
                           'USAGE') THEN
        RAISE EXCEPTION 'Solo el administrador puede crear cuentas de representante o administrador'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER usuarios_privilegiados_solo_dueno
    BEFORE INSERT ON usuarios
    FOR EACH ROW EXECUTE FUNCTION usuarios_exigir_dueno_para_privilegiados();

-- ---------------------------------------------------------------------
-- 2. Comprobacion comun: quien pide la accion es un administrador activo
-- ---------------------------------------------------------------------
CREATE FUNCTION exigir_administrador(p_administrador uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
    PERFORM 1 FROM usuarios
     WHERE id = p_administrador AND rol = 'administrador' AND activo AND eliminado_en IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Accion reservada al administrador' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Crear un representante (la API entrega el hash bcrypt, nunca la clave)
-- ---------------------------------------------------------------------
CREATE FUNCTION administrar_crear_representante(
    p_administrador uuid,
    p_nombre text,
    p_correo text,
    p_contrasena_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_id uuid;
BEGIN
    PERFORM exigir_administrador(p_administrador);
    IF p_contrasena_hash !~ '^\$2[aby]\$1[2-9]\$' THEN
        RAISE EXCEPTION 'La contrasena debe llegar como hash bcrypt de costo 12 o mas'
            USING ERRCODE = '22023';
    END IF;
    INSERT INTO usuarios (nombre_completo, correo_electronico, contrasena_hash, rol)
    VALUES (btrim(p_nombre), lower(btrim(p_correo)), p_contrasena_hash, 'representante')
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Crear un trazado a partir de una linea del catalogo oficial: copia el
--    recorrido real de ida y de vuelta (catalogo_puntos) a puntos_ruta.
-- ---------------------------------------------------------------------
CREATE FUNCTION administrar_crear_trazado(
    p_administrador uuid,
    p_codigo text,
    p_nombre text,
    p_comuna text,
    p_representante uuid,
    p_linea_catalogo integer,
    p_origen text,
    p_destino text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trazado uuid;
    v_ida uuid;
    v_vuelta uuid;
    v_puntos_ida integer;
    v_puntos_vuelta integer;
BEGIN
    PERFORM exigir_administrador(p_administrador);

    PERFORM 1 FROM usuarios
     WHERE id = p_representante AND rol = 'representante' AND activo AND eliminado_en IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El representante no existe o no esta activo' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) FILTER (WHERE sentido = 'ida'), count(*) FILTER (WHERE sentido = 'vuelta')
      INTO v_puntos_ida, v_puntos_vuelta
      FROM catalogo_puntos WHERE linea_id = p_linea_catalogo;
    IF v_puntos_ida < 2 OR v_puntos_vuelta < 2 THEN
        RAISE EXCEPTION 'La linea del catalogo no tiene su recorrido dibujado en ambos sentidos'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO trazados (codigo, nombre, comuna, representante_id)
    VALUES (btrim(p_codigo), btrim(p_nombre), btrim(p_comuna), p_representante)
    RETURNING id INTO v_trazado;

    INSERT INTO sentidos (trazado_id, sentido, origen, destino)
    VALUES (v_trazado, 'ida', btrim(p_origen), btrim(p_destino))
    RETURNING id INTO v_ida;
    INSERT INTO sentidos (trazado_id, sentido, origen, destino)
    VALUES (v_trazado, 'vuelta', btrim(p_destino), btrim(p_origen))
    RETURNING id INTO v_vuelta;

    INSERT INTO puntos_ruta (sentido_id, orden, latitud, longitud, distancia_acumulada_m)
    SELECT CASE p.sentido WHEN 'ida' THEN v_ida ELSE v_vuelta END,
           p.orden, p.latitud, p.longitud, p.distancia_acumulada_m
      FROM catalogo_puntos p
     WHERE p.linea_id = p_linea_catalogo;

    RETURN v_trazado;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Cambiar el representante de un trazado o activarlo/desactivarlo
--    (NULL = sin cambio). Devuelve false si el trazado no existe. No se
--    desactiva un trazado con colectivos en servicio: sus pasajeros los
--    estan siguiendo en el mapa.
-- ---------------------------------------------------------------------
CREATE FUNCTION administrar_actualizar_trazado(
    p_administrador uuid,
    p_trazado uuid,
    p_representante uuid,
    p_activo boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    PERFORM exigir_administrador(p_administrador);
    IF p_representante IS NOT NULL THEN
        PERFORM 1 FROM usuarios
         WHERE id = p_representante AND rol = 'representante' AND activo AND eliminado_en IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El representante no existe o no esta activo' USING ERRCODE = '22023';
        END IF;
    END IF;
    IF p_activo IS FALSE AND EXISTS (
        SELECT 1 FROM jornadas j JOIN vehiculos v ON v.id = j.vehiculo_id
         WHERE v.trazado_id = p_trazado AND j.finalizada_en IS NULL) THEN
        RAISE EXCEPTION 'El trazado tiene colectivos en servicio' USING ERRCODE = '22023';
    END IF;
    UPDATE trazados
       SET representante_id = coalesce(p_representante, representante_id),
           activo = coalesce(p_activo, activo)
     WHERE id = p_trazado;
    RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------
-- 6. Permisos: nadie mas que la API (y la duena) ejecuta estas funciones
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION exigir_administrador(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION administrar_crear_representante(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION administrar_crear_trazado(uuid, text, text, text, uuid, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION administrar_actualizar_trazado(uuid, uuid, uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION administrar_crear_representante(uuid, text, text, text) TO :"api_usuario";
GRANT EXECUTE ON FUNCTION administrar_crear_trazado(uuid, text, text, text, uuid, integer, text, text) TO :"api_usuario";
GRANT EXECUTE ON FUNCTION administrar_actualizar_trazado(uuid, uuid, uuid, boolean) TO :"api_usuario";
