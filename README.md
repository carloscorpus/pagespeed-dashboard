# PageSpeed NERD

Dashboard interno que analiza **todas las páginas de un sitio** con la API oficial de **Google PageSpeed Insights v5** (Lighthouse) y muestra rendimiento, accesibilidad, prácticas recomendadas y SEO, en **mobile y desktop**. Para cada problema indica qué archivos lo causan y cómo corregirlo, y genera un **Excel** y un **skill de Claude Code** para aplicar las correcciones en el proyecto.

Pensado para proyectos de **código propio**: temas de WordPress/WooCommerce hechos a medida, React, Next.js, JS/HTML.

> Uso interno. No tiene login a propósito: no lo publiques en una URL abierta sin protegerla (por ejemplo, con la protección por contraseña de Vercel).

## Qué hace

- **Entrada:** la URL del sitio (busca el sitemap, incluidos los `Sitemap:` de `robots.txt`), un `.txt` o una lista de URLs pegada.
- **Páginas repetitivas:** si las URLs vienen del sitemap, agrupa las páginas de la misma plantilla (productos, posts, categorías…) y analiza **3 por grupo**, repartidas; cada grupo se puede analizar completo. Una lista subida o pegada se analiza entera.
- **Análisis:** cada página se mide en mobile y desktop (2 pruebas por página), 4 a la vez, con reintentos. Se puede cancelar, continuar lo pendiente o reintentar una prueba.
- **Resultados:**
  - **Resumen:** puntajes, gráficos y distribución.
  - **Problemas globales:** lo que se repite en muchas páginas, y si hay archivos que retrasan el FCP.
  - **Páginas:** tabla ordenable y detalle por página con métricas, TTFB, elemento LCP y problemas con su ahorro estimado.
- **Origen de cada archivo:** por su ruta: del proyecto, `plugin/caché`, `núcleo de WordPress` o `tercero` (otro dominio).
- **Excel:** hojas Resultados, Resumen, Problemas globales, Recomendaciones y Errores.
- **Skill de Claude Code:** un ZIP con `.claude/skills/pagespeed-fixes/`. Trae un archivo de problemas globales, uno por grupo de páginas y los datos en JSON. Le indica a Claude qué corregir en el código del repo y qué queda fuera (plugins, servidor).
- **Persistencia:** el último análisis se guarda en el navegador (IndexedDB) y se recupera al recargar.
- **URLs que dan error:** las que responden 404/500 se reportan como error y no entran en los promedios.

## Requisitos

- Node.js **20.9 o superior** (probado con Node 24).
- Una API key de Google PageSpeed Insights: créala en [Google Cloud Console](https://console.cloud.google.com/apis/credentials) y activa la **PageSpeed Insights API** en el proyecto.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y pega tu key en PSI_API_KEY
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

Otros comandos: `npm run build` (compilación de producción), `npm run start` (sirve la compilación) y `npm run lint`.

## Variables de entorno

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `PSI_API_KEY` | (obligatoria) | Key de la API de Google PageSpeed Insights v5. |
| `RATE_LIMIT_PSI` | `600` | Máx. de pruebas a `/api/psi` por IP en la ventana. Un análisis de N páginas usa 2·N pruebas (+ reintentos). |
| `RATE_LIMIT_SITEMAP` | `30` | Máx. de llamadas a `/api/sitemap` por IP en la ventana. |
| `RATE_LIMIT_WINDOW_MIN` | `10` | Duración de la ventana, en minutos. |

Los límites viven en memoria (`src/lib/rate-limit.ts`): reiniciar el servidor los resetea y en Vercel cada instancia lleva su propio contador. Son una protección "best effort", no un límite estricto. Los valores no numéricos o ≤ 0 se ignoran y se usa el valor por defecto.

**Nunca subas `.env.local` al repositorio** (ya está en `.gitignore`).

## Deploy en Vercel

1. Importa el repositorio en Vercel (se detecta como Next.js).
2. Añade `PSI_API_KEY` en *Settings → Environment Variables*, y opcionalmente las `RATE_LIMIT_*`.
3. Despliega.

`/api/psi` y `/api/sitemap` tienen `maxDuration = 60`. Cada prueba de PSI es una petición propia de 20–30 s, así que entra en todos los planes de Vercel, incluido Hobby. Un análisis largo no es una sola petición: lo orquesta el navegador.

## Cómo funciona

1. El navegador envía cada página a `/api/psi`, que llama a la API de PageSpeed Insights con las 4 categorías y `locale=es`, y devuelve un resumen compacto.
2. Cada auditoría que falla se traduce con un diccionario propio (`src/lib/issues-dict.ts`): nombre en español y cómo corregirlo en el código del proyecto.
3. El origen de cada archivo se deduce de su ruta (`resourceOrigin` en `src/lib/format.ts`).
4. Se cruzan las páginas: lo que aparece en ≥ 80 % de ellas se considera **global**.
5. El Excel y el skill se generan en el navegador con plantillas, **sin IA**.

Los puntajes de rendimiento varían unos puntos entre mediciones, porque Google mide una sola carga cada vez. Los problemas y archivos señalados son mucho más estables que el número.

## Estructura

```
src/
  app/
    api/psi/route.ts       Una prueba de PageSpeed por llamada
    api/sitemap/route.ts   Busca el sitemap (protegido contra SSRF)
    page.tsx               Página principal
  components/              Interfaz (tabla, detalle, gráficos, skill, entrada de URLs)
  hooks/                   Estado del análisis y persistencia
  lib/
    orchestrator.ts        Cola de pruebas (concurrencia, reintentos)
    psi-extract.ts         Resumen de la respuesta de Lighthouse
    issues-dict.ts         Textos de cada problema
    sampling.ts            Agrupación de páginas repetitivas
    excel.ts · skill.ts    Exportaciones
    storage.ts             IndexedDB
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · Recharts · exceljs · jszip · lucide-react.

## Créditos

Datos: [API oficial de Google PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/about) (Lighthouse).
Hecho por **Carlos Corpus Susanibar**.

© 2026 Carlos Corpus Susanibar. Todos los derechos reservados. Uso interno.
