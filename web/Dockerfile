# Imagen de la puerta de entrada de produccion: Caddy con las tres apps web.
# Dos etapas: la primera instala las dependencias y compila las apps con
# Vite; la segunda es la imagen oficial de Caddy con solo los archivos
# compilados. La imagen final no trae Node.js, codigo fuente ni pruebas.

FROM node:24-slim AS construccion
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2
COPY --from=construccion /web/dist /srv/web
