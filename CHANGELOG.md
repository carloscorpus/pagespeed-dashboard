# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones según [SemVer](https://semver.org/lang/es/).

## [1.0.0] - 2026-10-03

Primera versión.

### Añadido
- **Análisis:**
  - Todas las páginas de un sitio con la API oficial de Google PageSpeed Insights v5, en mobile y desktop, con las 4 categorías.
  - Entrada por URL (sitemap y `robots.txt`), por `.txt` o pegando la lista.
  - Muestreo de páginas repetitivas (misma plantilla): 3 por grupo cuando las URLs vienen del sitemap.
  - Cola en el navegador con concurrencia 4, reintentos, cancelar, continuar lo pendiente y reintentar una prueba.
- **Resultados:**
  - Pestañas Resumen, Problemas globales y Páginas, y panel de detalle por página.
  - Origen de cada archivo según su ruta: proyecto, plugin/caché, núcleo de WordPress o tercero.
  - Las URLs que responden con error HTTP (404/500) se reportan como error y no entran en los promedios.
- **Exportación:** Excel (Resultados, Resumen, Problemas globales, Recomendaciones y Errores) y skill de Claude Code (`.claude/skills/pagespeed-fixes/`) orientado a proyectos de código propio.
- **Persistencia:** el último análisis se guarda en IndexedDB.
- **Límite de peticiones** por IP configurable con variables de entorno (`RATE_LIMIT_*`), con `Retry-After`.
