# Base de datos

Motor: **SQLite** (`better-sqlite3`), un solo archivo en `backend/data/pronostico.db`. No depende de ningún servicio externo: es la "base de datos propia" del proyecto, vive junto al backend y se versiona aparte del código (está en `.gitignore`).

Se crea y siembra automáticamente la primera vez que arranca el backend (`backend/src/db.js`), a partir del fixture real del Mundial 2026 (`backend/src/data/fixture.json`, generado desde el Excel oficial de partidos).

## Tablas

### `users`
| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| username | TEXT UNIQUE | marco, sergio, cesar, rimmy, jonathan, christian, admin |
| display_name | TEXT | Nombre mostrado en la UI |
| password_hash | TEXT | bcrypt |
| role | TEXT | `player` \| `admin` |
| must_change_password | INTEGER (bool) | `1` hasta que cambien la clave por defecto `123456` |
| created_at | TEXT | |

### `matches`
104 partidos (72 fase de grupos + 16 dieciseisavos + 8 octavos + 4 cuartos + 2 semis + 1 tercer puesto + 1 final).

| Columna | Tipo | Notas |
|---|---|---|
| id | TEXT PK | ej. `G001`, `R32_073`, `OCTA_089`, `FINA_104` |
| num | INTEGER | número de partido oficial del fixture (1-104) |
| phase | TEXT | `Grupos`, `Dieciseisavos`, `Octavos`, `Cuartos`, `Semifinal`, `TercerPuesto`, `Final` |
| group_name | TEXT \| NULL | A-L solo en fase de grupos |
| home / away | TEXT \| NULL | nombre del equipo. `NULL` en fases eliminatorias hasta que el admin los define (dependen de quién avanza) |
| stadium | TEXT | |
| date_local / time_local | TEXT | fecha y hora local del estadio, tal como figura en el fixture oficial |
| kickoff_at_utc | TEXT | hora de inicio **en UTC**, calculada una sola vez al sembrar la base, según la zona horaria real de cada estadio en jun-jul 2026. Es la que usa el servidor para bloquear pronósticos — **no se puede editar por API**, así nadie puede "mover el horario" para destrabar un partido |
| home_score / away_score | INTEGER \| NULL | resultado real, solo lo escribe el admin (incluye penales sumados si aplica) |

### `predictions`
| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users | |
| match_id | TEXT FK → matches | |
| home_pred / away_pred | INTEGER | pronóstico del jugador |
| updated_at | TEXT | |
| | | `UNIQUE(user_id, match_id)` — un pronóstico por jugador por partido, se actualiza con upsert |

### `config`
Tabla clave-valor para ajustes parametrizables desde el panel admin.

| key | value por defecto | Uso |
|---|---|---|
| `lock_minutes_before_kickoff` | `60` | Minutos antes del *kickoff* en que se bloquean los pronósticos de ese partido |

## Regla de bloqueo (server-side, no falsificable)

```
bloqueado = ahora_del_servidor >= (kickoff_at_utc - lock_minutes_before_kickoff)
```

Este cálculo vive **solo en el backend** (`backend/src/routes/matches.routes.js`). El frontend nunca decide si un partido está bloqueado: el backend rechaza con `403` cualquier intento de guardar o cambiar un pronóstico de un partido ya bloqueado, sin importar qué hora diga el navegador del jugador.

## Puntaje

Calculado al vuelo (no se guarda), en `backend/src/scoring.js`:
- 4 puntos: marcador exacto.
- 2 puntos: acierta solo el resultado (ganador o empate), no el marcador.
- 0 puntos: falla el resultado, o no pronosticó, o el partido todavía no tiene resultado real.
