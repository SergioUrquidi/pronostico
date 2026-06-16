# Arquitectura

## Decisión: separar frontend (Angular/GitHub Pages) y backend (Node/SQLite)

El pedido inicial planteaba "todo en Angular, sin base de datos externa, pero que nadie pueda cambiar resultados ni horarios desde otro lado". Esas dos cosas son incompatibles si todo vive en el navegador:

- Para que **6 personas vean la misma tabla de posiciones**, los datos tienen que estar en un lugar compartido, no en el `localStorage` de cada celular.
- Para que **nadie pueda hacer trampa con el horario**, la validación de "¿ya se puede pronosticar este partido?" tiene que hacerla un servidor con su propio reloj, no JavaScript corriendo en el celular de cada jugador.

Por eso: Angular hace de interfaz (publicable gratis en GitHub Pages, que es justamente lo que se pedía para "difundir mediante GitHub"), y un backend chico en Node.js con su propia base de datos SQLite hace de fuente de verdad y de policía de reglas.

## Diagrama

```
┌─────────────────────┐        HTTPS / JSON        ┌──────────────────────────┐
│  Angular (frontend)  │ ──────────────────────────▶│  Node + Express (backend) │
│  GitHub Pages        │◀────────────────────────── │  Render / Railway (gratis) │
│  - login             │                             │  - JWT auth                │
│  - pronósticos       │                             │  - reglas de bloqueo       │
│  - partidos/resultados│                            │  - cálculo de puntaje      │
│  - tabla de posiciones│                            └──────────┬───────────────┘
│  - panel admin        │                                        │
└─────────────────────┘                                        ▼
                                                        ┌──────────────────┐
                                                        │  SQLite (1 archivo) │
                                                        │ backend/data/*.db   │
                                                        └──────────────────┘
```

## Backend (`backend/`)

- **Express** + **better-sqlite3** (síncrono, simple, sin servidor de base de datos aparte — un solo archivo `.db`).
- **JWT** para sesión (30 días), con `mustChangePassword` embebido en el token para forzar el cambio de clave en el primer login.
- **bcryptjs** para hashear claves.
- Rutas:
  - `POST /api/auth/login`, `POST /api/auth/change-password`
  - `GET /api/matches` (incluye `locked` calculado server-side)
  - `GET /api/predictions/me`, `PUT /api/predictions/:matchId`, `GET /api/predictions/all` (solo revela pronósticos de partidos ya bloqueados, para que nadie copie a último momento)
  - `GET /api/scoreboard`
  - `PUT /api/admin/matches/:id/result`, `PUT /api/admin/matches/:id/teams`, `GET|PUT /api/admin/config` (todas requieren rol `admin`)

## Frontend (`frontend/`)

- **Angular 21**, standalone components + signals (sin NgModules), `inject()` en vez de constructor injection.
- `core/auth.service.ts` guarda el token y el usuario en `localStorage` con signals reactivos.
- `core/auth.interceptor.ts` agrega el `Bearer` token a cada request y desloguea automáticamente en un 401.
- `core/guards.ts`: `authGuard` (requiere login + clave ya cambiada), `adminGuard`, `changePasswordGuard`.
- Diseño mobile-first (la app se usa principalmente desde el celular durante el Mundial): navegación inferior fija, tarjetas, una sola columna con `max-width: 720px`.
- Páginas:
  - `pages/login` — ingreso por usuario/clave
  - `pages/change-password` — obligatorio en el primer ingreso
  - `pages/predict` — pronósticos por fase/grupo, con inputs bloqueados cuando el backend dice `locked: true`
  - `pages/matches` — ve los pronósticos de todos por partido (solo una vez bloqueado)
  - `pages/scoreboard` — tabla de posiciones (dashboard)
  - `pages/admin` — resultados reales, nombres de equipos en fases eliminatorias, y el minuto de bloqueo parametrizable

## Por qué no Supabase/Firebase

Se evaluó usar una base de datos en la nube (Supabase/Firebase) para no tener que mantener un backend propio, pero el usuario pidió explícitamente una base de datos propia documentada en Markdown dentro del repo, y backend en Node.js. Esta arquitectura cumple ambas cosas sin atarse a un proveedor externo: todo el código (API + esquema + datos) vive en este repositorio.
