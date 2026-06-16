# Pronóstico Mundial 2026

Quiniela privada para 6 personas (marco, sergio, cesar, rimmy, jonathan, christian) + un administrador. Cada jugador pronostica los 104 partidos del Mundial 2026 y compite por puntos en una tabla de posiciones.

## Reglas de puntaje

| Resultado del pronóstico | Puntos |
|---|---|
| Resultado exacto (marcador idéntico) | 4 |
| Solo acierta ganador/empate (signo) | 2 |
| Falla | 0 |

A partir de Dieciseisavos de final, si un partido se define por penales, el resultado de penales **se suma** al marcador (regla oficial de la quiniela).

## Por qué hay un backend (y no solo Angular + localStorage)

El pedido original era una "base de datos interna en Angular", pero **6 personas en 6 celulares distintos necesitan ver los mismos datos**, y nadie debe poder:
- editar un pronóstico después de la hora límite (aunque cambie la hora de su celular),
- tocar los resultados reales (solo el admin),
- modificar el horario de cierre para hacer trampa.

Eso solo se puede garantizar validándolo **en un servidor**, no en el navegador. Por eso se separó en:

- **`frontend/`** — Angular 21 (standalone + signals), la UI. Se puede publicar gratis en GitHub Pages.
- **`backend/`** — Node.js + Express + SQLite (`better-sqlite3`), un archivo de base de datos propio (`backend/data/pronostico.db`), sin dependencias externas de pago. Se publica gratis en Render/Railway/Fly.io.

El horario de cierre (`lock_minutes_before_kickoff`, default 60 minutos antes del partido) es **parametrizable desde el panel de administrador**, pero el cálculo de "¿está bloqueado?" siempre lo hace el servidor con su propio reloj — nunca el navegador del jugador.

Ver el esquema completo en [`BASE_DE_DATOS.md`](BASE_DE_DATOS.md) y la arquitectura en [`ARQUITECTURA.md`](ARQUITECTURA.md).

## Usuarios

| Usuario | Clave inicial | Rol |
|---|---|---|
| marco, sergio, cesar, rimmy, jonathan, christian | `123456` | Jugador |
| admin | `123456` | Administrador |

Todos deben cambiar la clave en el primer ingreso (la app fuerza la pantalla de cambio de clave, sin requisitos de complejidad — solo mínimo 4 caracteres, tal como se pidió).

## El backend gratis "se duerme" — por qué y cómo se mitiga

Render free tier apaga la instancia después de ~15 minutos sin pedidos, y el primer pedido después de eso tarda hasta 50 segundos en responder (o falla una vez con error de CORS/timeout, que es justo lo que nuestro propio cliente HTTP nunca llega a recibir bien armado). Para que esto casi no se note durante el mes del Mundial, `.github/workflows/keep-alive.yml` le hace un ping a `/health` cada 10 minutos, las 24 horas — gratis, usando GitHub Actions, sin servicios externos. No es 100% infalible (un ping puntual puede fallar), pero en la práctica evita que la instancia llegue a dormirse.

Si en algún momento se quiere garantía total (cero cold-starts), la alternativa es pasar el Web Service de Render al plan **Starter** (~$7/mes) — sin pings, sin riesgo, pero con costo real.

## Cómo correrlo en local

### Backend
```bash
cd backend
npm install
npm run dev      # http://localhost:4000
```
La base de datos y el fixture de 104 partidos se siembran solos la primera vez que arranca (`backend/src/db.js`).

### Frontend
```bash
cd frontend
npm install
npm start         # http://localhost:4200
```

## Cómo publicarlo (gratis, durante el mes del Mundial)

### 1. Backend → Render (gratis)
1. Subí la carpeta `backend/` a este repo de GitHub.
2. En [render.com](https://render.com) → New → Web Service → conectá el repo, root directory `backend`.
3. Build command: `npm install` — Start command: `npm start`.
4. Variable de entorno `JWT_SECRET` con un valor random largo.
5. Copiá la URL pública que te da Render (algo como `https://pronostico-api.onrender.com`).

### 2. Frontend → GitHub Pages (gratis)
1. Editá `frontend/src/app/core/api-config.ts` y reemplazá `https://TU-BACKEND-AQUI/api` por la URL de Render + `/api`.
2. Hacé commit y push a `main`.
3. El workflow `.github/workflows/deploy-frontend.yml` construye y publica automáticamente en GitHub Pages en cada push.
4. Activá Pages en GitHub: Settings → Pages → Source: "GitHub Actions".

La app queda en `https://sergiourquidi.github.io/pronostico/` (o el nombre que tenga el repo).

## Estructura

```
backend/    API Node/Express + SQLite (fuente de verdad de datos y reglas de horario)
frontend/   Angular 21 standalone + signals, mobile-first
ARQUITECTURA.md    Decisiones de arquitectura
BASE_DE_DATOS.md   Esquema de la base de datos
```
