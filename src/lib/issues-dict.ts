/**
 * Diccionario por ID de audit (Lighthouse 13.x: conviven audits clásicos e "insights").
 * Pensado para proyectos de **código propio** (tema WordPress/Woo a medida, React, Next, JS/HTML).
 * n   = nombre en español.
 * f   = cómo corregirlo en el código del proyecto (qué se busca lograr y cómo).
 * srv = true si no se corrige en el código sino en el servidor/hosting/CDN.
 * Si un ID no está aquí se usa el `title` de la API y la descripción que trae.
 */
export interface IssueMeta { n: string; f: string; srv?: boolean }

export const ISSUES: Record<string, IssueMeta> = {
  // ── Rendimiento ──
  'render-blocking-insight': {
    n: 'CSS/JS que bloquea el renderizado',
    f: 'Que nada retrase la primera pintura: inlinea en el <head> el CSS crítico (lo visible al cargar) y carga el resto sin bloquear; añade defer al JS que no sea imprescindible; aloja las fuentes en el proyecto (en lugar de fonts.googleapis.com) con font-display: swap y precarga la principal.',
  },
  'render-blocking-resources': {
    n: 'CSS/JS que bloquea el renderizado',
    f: 'Inlinea el CSS crítico, carga el resto del CSS sin bloquear y añade defer/async al JS no esencial.',
  },
  'unused-javascript': {
    n: 'JavaScript sin usar',
    f: 'Carga cada script solo en las páginas que lo usan (encolado condicional / imports dinámicos por ruta), divide el bundle y elimina librerías que no se usan o impórtalas por partes.',
  },
  'unused-css-rules': {
    n: 'CSS sin usar',
    f: 'Elimina el CSS que no se usa (purge en el build, p. ej. Tailwind/PurgeCSS) y separa el CSS por plantilla para que cada página cargue solo el suyo.',
  },
  'unminified-javascript': {
    n: 'JavaScript sin minificar',
    f: 'Sirve el JS minificado desde el build (modo producción); revisa scripts sueltos del proyecto que se encolan sin pasar por el build.',
  },
  'unminified-css': {
    n: 'CSS sin minificar',
    f: 'Sirve el CSS minificado desde el build (modo producción); revisa hojas de estilo sueltas que se encolan sin pasar por el build.',
  },
  'image-delivery-insight': {
    n: 'Imágenes pesadas o mal dimensionadas',
    f: 'Sirve cada imagen al tamaño real en que se muestra (srcset + sizes correctos en las plantillas) y en WebP/AVIF con buena compresión; no uses la imagen original a tamaño completo.',
  },
  'uses-optimized-images': {
    n: 'Imágenes sin optimizar',
    f: 'Comprime las imágenes (en el build o al subirlas) y sírvelas en WebP/AVIF.',
  },
  'uses-responsive-images': {
    n: 'Imágenes más grandes de lo necesario',
    f: 'Usa srcset/sizes en las plantillas para servir la resolución adecuada a cada pantalla (en WordPress, los tamaños registrados con add_image_size y wp_get_attachment_image).',
  },
  'modern-image-formats': {
    n: 'Imágenes en formato antiguo',
    f: 'Sirve las imágenes en WebP o AVIF (con <picture> o conversión en el build/servidor) manteniendo un formato de respaldo si hace falta.',
  },
  'offscreen-images': {
    n: 'Imágenes fuera de pantalla sin lazy load',
    f: 'Añade loading="lazy" a las imágenes que no están en la primera pantalla (nunca a la imagen principal/LCP).',
  },
  'lcp-discovery-insight': {
    n: 'La imagen LCP carga sin prioridad',
    f: 'En la imagen principal (hero): fetchpriority="high", sin loading="lazy", y que esté en el HTML inicial (no como background por CSS ni inyectada por JS). Si es un background imprescindible, precárgala con <link rel="preload" as="image">.',
  },
  'unsized-images': {
    n: 'Imágenes sin width/height',
    f: 'Añade width y height (o aspect-ratio en CSS) a las imágenes de las plantillas para reservar su espacio y evitar saltos de diseño.',
  },
  'legacy-javascript-insight': {
    n: 'JavaScript heredado (polyfills)',
    f: 'Apunta el build a navegadores modernos (browserslist / build.target) para no generar polyfills ni transpilación innecesaria.',
  },
  'duplicated-javascript-insight': {
    n: 'JavaScript duplicado',
    f: 'Evita que la misma librería se empaquete o cargue dos veces (varios bundles o un CDN + el bundle); compártela en un chunk común.',
  },
  'font-display-insight': {
    n: 'Fuentes sin font-display',
    f: 'Usa font-display: swap en cada @font-face (o &display=swap si sigues usando Google Fonts) y aloja las fuentes en el proyecto.',
  },
  'forced-reflow-insight': {
    n: 'Reflujos forzados (layout thrashing)',
    f: 'En los scripts señalados, agrupa las lecturas del DOM (offsetHeight, getBoundingClientRect…) antes de las escrituras, o usa requestAnimationFrame.',
  },
  'bootup-time': {
    n: 'Tiempo de ejecución de JavaScript',
    f: 'Reduce el JS que se ejecuta al cargar: difiere lo no crítico, carga los módulos bajo demanda y retrasa los scripts de terceros hasta la interacción.',
  },
  'total-byte-weight': {
    n: 'Página muy pesada (bytes)',
    f: 'Reduce el peso total: imágenes y vídeos optimizados, menos fuentes y variantes, y elimina recursos que no aportan.',
  },
  'cache-insight': {
    n: 'Caché del navegador insuficiente', srv: true,
    f: 'Servidor/hosting: sirve los estáticos con Cache-Control de larga duración (p. ej. un año + immutable para archivos con hash). En el código, asegúrate de que el build genere nombres con hash para poder cachearlos sin riesgo.',
  },
  'uses-long-cache-ttl': {
    n: 'Caché del navegador insuficiente', srv: true,
    f: 'Servidor/hosting: sirve los estáticos con Cache-Control de larga duración (archivos con hash en el nombre).',
  },
  'document-latency-insight': {
    n: 'Respuesta lenta del documento', srv: true,
    f: 'Servidor/hosting: activa la caché de página/HTML (servidor o CDN) y la compresión (gzip/brotli), y evita redirecciones. En el código, revisa consultas o llamadas lentas al generar la página.',
  },
  'server-response-time': {
    n: 'Respuesta lenta del servidor (TTFB)', srv: true,
    f: 'Servidor/hosting: activa la caché de página (servidor o CDN). En el código, revisa consultas lentas, llamadas a APIs externas y lógica pesada al generar la página.',
  },
  'redirects': {
    n: 'Redirecciones',
    f: 'Enlaza directamente a la URL final (https, con/sin www y barra final) en menús, enlaces y canonical.',
  },
  'third-parties-insight': {
    n: 'Scripts de terceros',
    f: 'Retrasa los scripts de terceros (chat, analytics, píxeles, mapas) hasta la interacción o tras la carga, y elimina los que no se usan.',
  },
  'dom-size-insight': {
    n: 'DOM demasiado grande',
    f: 'Simplifica el marcado de las plantillas (menos contenedores anidados) y renderiza bajo demanda las listas o secciones largas.',
  },
  'cls-culprits-insight': {
    n: 'Saltos de diseño (CLS)',
    f: 'Reserva espacio (width/height o aspect-ratio) para imágenes, iframes, banners y contenido que se inserta tarde; usa font-display y fuentes de respaldo con métricas parecidas.',
  },
  'layout-shifts': {
    n: 'Saltos de diseño (CLS)',
    f: 'Reserva espacio (width/height o aspect-ratio) para imágenes, banners y fuentes que cargan tarde.',
  },
  'long-tasks': {
    n: 'Tareas largas en el hilo principal',
    f: 'Divide el trabajo pesado de JS en tareas más cortas (await / scheduler.yield / setTimeout) y difiere lo no crítico.',
  },
  'non-composited-animations': {
    n: 'Animaciones no compuestas',
    f: 'Anima solo transform y opacity en CSS (no width, height, top, left ni box-shadow).',
  },

  // ── Accesibilidad ──
  'image-alt': { n: 'Imágenes sin texto alternativo', f: 'Añade un alt descriptivo a cada imagen (alt="" si es decorativa); en las plantillas, usa el alt del contenido en lugar de dejarlo vacío.' },
  'color-contrast': { n: 'Contraste de color insuficiente', f: 'Sube el contraste entre texto y fondo (mínimo 4.5:1; 3:1 para texto grande) en los estilos del proyecto.' },
  'link-name': { n: 'Enlaces sin nombre accesible', f: 'Dale texto visible o aria-label a los enlaces que solo tienen icono o imagen.' },
  'button-name': { n: 'Botones sin nombre accesible', f: 'Añade texto o aria-label a los botones que solo tienen icono.' },
  'label': { n: 'Campos de formulario sin etiqueta', f: 'Asocia un <label for> (o aria-label) a cada campo del formulario.' },
  'html-has-lang': { n: '<html> sin atributo lang', f: 'Declara el idioma en la etiqueta <html> (lang="es"); en WordPress, con language_attributes() en el header del tema.' },
  'html-lang-valid': { n: 'Atributo lang inválido', f: 'Usa un código de idioma válido (ej. es, es-PE).' },
  'document-title': { n: 'Página sin <title>', f: 'Genera un <title> único por página (en WordPress, add_theme_support("title-tag")).' },
  'heading-order': { n: 'Orden de encabezados incorrecto', f: 'Usa los niveles de encabezado en orden (h1 → h2 → h3), sin saltos; si un nivel es solo estético, cámbialo y ajusta el CSS.' },
  'aria-allowed-attr': { n: 'Atributos ARIA no permitidos', f: 'Quita o corrige los atributos aria-* que no corresponden al rol del elemento.' },
  'aria-hidden-focus': { n: 'Elementos aria-hidden enfocables', f: 'No uses aria-hidden en elementos con foco, o quítales el foco (tabindex="-1" o inert).' },
  'aria-required-attr': { n: 'Faltan atributos ARIA obligatorios', f: 'Añade los atributos aria-* que exige el rol del elemento.' },
  'aria-valid-attr-value': { n: 'Valores ARIA inválidos', f: 'Corrige los valores de los atributos aria-* (ids que no existen, valores no permitidos).' },
  'tabindex': { n: 'tabindex mayor que 0', f: 'Quita los tabindex positivos; deja que el orden del DOM defina el foco.' },
  'target-size': { n: 'Objetivos táctiles muy pequeños', f: 'Aumenta el tamaño o el espaciado de botones y enlaces (mínimo 24×24 px).' },
  'frame-title': { n: 'iframes sin título', f: 'Añade title a cada <iframe> (mapas, vídeos).' },
  'bypass': { n: 'Sin enlace para saltar al contenido', f: 'Añade un enlace "Saltar al contenido" al inicio del <body> que apunte al <main>.' },
  'meta-viewport': { n: 'Viewport impide hacer zoom', f: 'Quita user-scalable=no y maximum-scale del meta viewport.' },
  'list': { n: 'Listas mal estructuradas', f: 'Los <ul>/<ol> solo deben contener <li> directamente.' },
  'listitem': { n: '<li> fuera de una lista', f: 'Coloca cada <li> dentro de un <ul> o <ol>.' },
  'duplicate-id-aria': { n: 'IDs duplicados usados por ARIA', f: 'Haz únicos los id referenciados por aria-labelledby / aria-describedby (ojo con componentes repetidos).' },

  // ── SEO ──
  'meta-description': { n: 'Sin meta descripción', f: 'Genera una meta descripción única (120–160 caracteres) por página, desde el contenido o un campo editable.' },
  'link-text': { n: 'Enlaces con texto poco descriptivo', f: 'Cambia "clic aquí" / "ver más" por textos que describan el destino (o añade texto oculto accesible).' },
  'crawlable-anchors': { n: 'Enlaces no rastreables', f: 'Usa <a href="..."> reales en vez de enlaces con solo onclick o href="#"/"javascript:".' },
  'is-crawlable': { n: 'Página bloqueada para indexación', f: 'Quita el meta robots noindex o la regla de robots.txt que la bloquea (revisa que no venga de un entorno de staging).' },
  'http-status-code': { n: 'Código de estado HTTP incorrecto', srv: true, f: 'Servidor/hosting: la página debe responder 200; revisa redirecciones y errores 4xx/5xx.' },
  'canonical': { n: 'Canonical inválida', f: 'Genera una URL canónica absoluta que apunte a una página indexable.' },
  'robots-txt': { n: 'robots.txt inválido', f: 'Corrige los errores de sintaxis de robots.txt.' },
  'hreflang': { n: 'hreflang inválido', f: 'Corrige los códigos de idioma/región y asegúrate de que sean recíprocos entre versiones.' },
  'font-size': { n: 'Tamaño de fuente ilegible en móvil', f: 'Usa al menos 12 px en el texto del cuerpo en móvil.' },
  'tap-targets': { n: 'Elementos táctiles muy juntos', f: 'Aumenta el tamaño y el espaciado de botones y enlaces en móvil.' },
  'image-aspect-ratio': { n: 'Imágenes con proporción incorrecta', f: 'Muestra las imágenes con su proporción natural (width/height correctos o object-fit).' },

  // ── Prácticas recomendadas ──
  'is-on-https': { n: 'Recursos servidos sin HTTPS', f: 'Corrige el contenido mixto: carga todos los recursos por https (URLs fijas en plantillas, CSS y contenido).' },
  'errors-in-console': { n: 'Errores en la consola del navegador', f: 'Abre DevTools → Consola y corrige los errores (scripts rotos, recursos 404).' },
  'deprecations': { n: 'APIs obsoletas en uso', f: 'Actualiza el código o las librerías que usan APIs del navegador en desuso.' },
  'inspector-issues': { n: 'Problemas detectados en DevTools', f: 'Revisa el panel "Problemas" de DevTools (cookies, contenido mixto, etc.).' },
  'charset': { n: 'Codificación de caracteres no declarada', f: 'Declara <meta charset="utf-8"> al inicio del <head>.' },
  'doctype': { n: 'Falta el doctype', f: 'Añade <!DOCTYPE html> al inicio del documento.' },
  'third-party-cookies': { n: 'Cookies de terceros', f: 'Elimina o reemplaza los scripts de terceros que usan cookies de terceros.' },
  'image-size-responsive': { n: 'Imágenes con resolución incorrecta', f: 'Sirve imágenes con la resolución adecuada al tamaño mostrado (srcset).' },
  'valid-source-maps': { n: 'Source maps inválidos', f: 'Genera source maps válidos en el build o no los publiques en producción.' },
};

/**
 * Texto de "cómo corregirlo". Se resuelve al mostrar (no se usa el guardado en el resultado),
 * así un análisis guardado muestra siempre los textos actuales del diccionario.
 */
export const fixText = (issue: { id: string; fix: string }): string => ISSUES[issue.id]?.f ?? issue.fix;

/** true si el problema se corrige en el servidor/hosting y no en el código del proyecto. */
export const isServerIssue = (id: string): boolean => !!ISSUES[id]?.srv;
