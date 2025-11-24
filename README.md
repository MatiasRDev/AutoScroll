# AutoScroll (Userscript)

## Resumen rápido
AutoScroll es un userscript que desplaza páginas de forma suave y configurable, con panel flotante y perfiles por sitio.

Principales features:
- Autoscroll suave con control de velocidad y arranque/parada rápidos.
- Scroll infinito opcional con umbral configurable.
- Gestos por clics, clic medio y triple clic; atajos personalizables.
- Pausa inteligente ante interacción, con reanudación automática.
- Perfiles por dominio/subdominio y reglas de auto-inicio.
- Panel personalizable (tema, tamaño, tira lateral) y herramientas de exportar/importar.

## Índice (Tabla de contenidos)
- [Instalación](#instalación)
- [Uso básico](#uso-básico)
- [Secciones del panel](#secciones-del-panel)
  - [Básico](#básico)
  - [Visibilidad del panel](#visibilidad-del-panel)
  - [Gestos y atajos](#gestos-y-atajos)
  - [Pausa inteligente](#pausa-inteligente)
  - [Curvas y Boost](#curvas-y-boost)
  - [Reglas de activación](#reglas-de-activación)
  - [Apariencia](#apariencia)
  - [Perfiles por sitio](#perfiles-por-sitio)
  - [Herramientas](#herramientas)
  - [Avanzado (debug)](#avanzado-debug)
- [Perfiles por sitio y reglas de activación](#perfiles-por-sitio-y-reglas-de-activación)
- [Gestos y atajos de teclado](#gestos-y-atajos-de-teclado)
- [Importar--exportar-configuración](#importar--exportar-configuración)
- [Solución de problemas frecuentes (FAQ)](#solución-de-problemas-frecuentes-faq)
- [Desarrollo y testing (para contribuidores)](#desarrollo-y-testing-para-contribuidores)

## Instalación
1. Requisitos: navegador compatible con extensiones y un gestor de userscripts (Tampermonkey o Violentmonkey recomendados).
2. Instalación directa: [abrir userscript](https://raw.githubusercontent.com/MatiasRDev/AutoScroll/main/autoscroll.user.js). El gestor debería detectar la URL RAW y proponer la instalación.
3. Si no se instala automáticamente: abre el enlace desde el botón "+" o "Crear script" de Tampermonkey/Violentmonkey, pega la URL RAW y confirma. Asegúrate de tener el gestor habilitado en el navegador.

## Uso básico
- **Abrir el panel:** presiona la hotkey de panel (por defecto `Shift + H`) o haz clic en la tira lateral si la activaste.
- **Iniciar/detener autoscroll:** usa el botón principal del panel o la hotkey de inicio/parada (por defecto `Shift + A`).
- **Estado Activo/Inactivo:** el indicador muestra `● ON`/`● Desplazando…` cuando el autoscroll está corriendo y `● OFF`/`● Inactivo` cuando está detenido.
- **Restablecer valores por defecto:** en la sección **Herramientas**, usa "Restablecer valores globales" (para todo) o "Restablecer perfil del sitio" (solo para el dominio actual).

## Secciones del panel
Cada bloque del panel tiene un título y un subtítulo. A continuación se describe qué hace cada opción con su nombre exacto en la interfaz.

### Básico
Velocidad y controles rápidos del autoscroll, incluyendo Infinite scroll.
- **Velocidad (px/s):** regula la rapidez del desplazamiento. Rango 30–3000 px/s; valores altos hacen el scroll más veloz pero menos legible.
- **Hotkey iniciar/detener autoscroll:** atajo global para alternar el estado del autoscroll.
- **Paso rápido (px/s):** incremento/decremento aplicado por los botones "− paso" y "+ paso". Útil para ajustar rápidamente sin mover el slider.
- **Invertir dirección:** invierte el sentido del desplazamiento en marcha.
- **Activar Infinite scroll:** enciende el cargado automático de más contenido al acercarse al final.
  - **Umbral (px):** distancia al final en la que se dispara la carga. Valores menores cargan antes; entre 500–1200 px suele ser cómodo.
  - **Timeout (ms):** tiempo máximo de espera antes de reintentar o detener. Aumenta si el sitio tarda en responder.
  - **Selector loader (opcional):** CSS selector del indicador de carga del sitio (ej. `.spinner`, `#loading`). Dejar vacío para usar la detección básica.
  - **Banner de parada:** si aparece el aviso, significa que hubo múltiples timeouts; revisa el sitio y reactiva el toggle cuando quieras reanudar.

### Visibilidad del panel
Controla cómo aparece/desaparece el panel flotante.
- **Hotkey mostrar/ocultar (ocultar completo):** atajo para esconder o recuperar el panel entero.
- **Ocultar completamente:** oculta el panel hasta volver a usar la hotkey.
- **Usar tira lateral al ocultar:** activa una tira en el borde de la pantalla.
  - **Ocultar (tira):** esconde el panel y deja solo la tira. Al acercar el cursor se expande; clic para reabrir.
  - **Lado:** elige izquierda o derecha.
  - **Auto-ocultar (s):** tras expandirse, cuánto tarda en volver a hacerse delgada. 0 desactiva el auto-ocultado.
  - **Grosor (px) / Al acercarse (px):** define el ancho normal y el ancho expandido al pasar el cursor.
  - **Alto (px) / Posición vertical (%):** tamaño y ubicación de la tira respecto al viewport.
  - **Rango de detección (px):** distancia desde el borde a la que el puntero activa la tira.

### Gestos y atajos
Permite controlar el autoscroll con clics y teclas rápidas.
- **Activar autoscroll por clics:** habilita el gesto de clics repetidos. Ignora inputs y enlaces para evitar interferencias.
  - **Cantidad:** número de clics necesarios (1–6).
  - **Ventana (ms):** tiempo máximo entre clics para contar como gesto.
- **Clic medio: pausar/reanudar:** activa la pausa con el botón central del mouse.
- **Triple-clic (acción):** elige acción al hacer triple clic (ninguna, ir arriba, ir abajo, alternar dirección).
  - **Ventana triple-clic (ms):** margen de tiempo para detectar el gesto.

### Pausa inteligente
Suspende el desplazamiento al detectar interacción y puede reanudarlo.
- **Usar pausa inteligente:** interruptor general.
- **Rueda del mouse / Teclas de lectura / Selección de texto/drag / Foco en input/textarea:** eventos que activan la pausa; desmarca lo que no quieras detectar.
- **Auto-reanudación (ms):** tiempo de espera antes de reanudar automáticamente.
- **No reanudar si el foco sigue en input/textarea:** mantiene la pausa mientras estés escribiendo.

### Curvas y Boost
Ajusta la suavidad y aceleraciones temporales.
- **Rampa inicio (ms, 0=OFF) / Rampa stop (ms, 0=OFF):** aplican una aceleración o desaceleración progresiva al iniciar/detener. Valores de 200–800 ms suelen sentirse naturales.
- **Shift (×) / Ctrl (×):** multiplicadores de velocidad mientras mantienes cada tecla.
- **Permitir combinación:** si está activo, pulsar Shift y Ctrl a la vez combina ambos multiplicadores.

### Reglas de activación
Define lista blanca/negra para auto-inicio del autoscroll.
- **Nueva regla:** elige tipo "Bloquear" o "Permitir" y escribe un patrón (acepta comodines `*`, por ejemplo `*://*.manhwaweb.com/leer/*`).
- **Agregar / Limpiar:** añade la regla o borra todas.
- **Lista de reglas:** se muestran en orden; primero se aplica **Bloquear**, luego **Permitir**.
- **Auto-iniciar si coincide una “Permitir”:** si una URL cumple una regla de permitir, el autoscroll se inicia solo.
- **Probar con URL actual:** valida la coincidencia de las reglas con la página abierta.

### Apariencia
Personaliza el aspecto y la legibilidad del panel.
- **Tema:** auto (según sistema), oscuro o claro.
- **Opacidad panel:** transparencia general (0.70–1). Útil para ver el contenido detrás.
- **Tamaño de fuente (%):** escala tipográfica (80–130%).
- **Escala panel (%):** escala global del panel (50–250%). Sube si ves el panel pequeño con zoom del navegador.
- **Radio bordes (px):** redondeo de esquinas.
- **UI compacta:** reduce espaciados para panel más denso.
- **Ancho panel (px):** ancho fijo del panel.
- **Sombra (alpha):** intensidad de la sombra.
- **Color de acento:** paleta (teal, blue, indigo, amber, pink).
- **Modo accesibilidad (lectura de pantalla):** activa roles/atributos accesibles.

### Perfiles por sitio
Gestiona configuraciones por dominio o subdominio.
- **Usar perfil para este dominio/host:** guarda y aplica ajustes específicos del sitio actual.
- **Forzar subdominio (sin herencia):** si el host tiene subdominio, crea un perfil independiente sin heredar del dominio base.
- **Buscar / Orden:** filtra y ordena perfiles guardados (A→Z o "Más específico primero").
- **Guardar (este host):** almacena la configuración actual para el host visible.
- **Preferencia por defecto para nuevos subdominios:** define qué hacer cuando visitas un subdominio nuevo (preguntar, crear desde dominio, desde global o en blanco).
- **Usar PSL-lite (recomendado):** mejora la detección del dominio base en TLD compuestos.
- **Dominio base manual (override):** permite fijar un dominio base específico; incluye guardar/eliminar override.
- **Prompt de subdominios:** si está activo, el panel ofrece crear el perfil desde el dominio, global o en blanco y permite recordar la preferencia.

### Herramientas
Acceso rápido a mantenimiento y copias de seguridad.
- **Exportar JSON…:** descarga todas las preferencias (globales y perfiles) en un archivo JSON.
- **Importar JSON…:** carga un archivo JSON con configuraciones; el script normaliza valores fuera de rango.
- **Restablecer valores globales / Restablecer perfil del sitio:** vuelve a los valores por defecto globales o del dominio actual.

### Avanzado (debug)
Opciones para inspeccionar el comportamiento en pantalla.
- **Mostrar overlay:** activa un overlay con métricas.
- **FPS / Velocidad / Distancia / Estado:** elige qué métricas mostrar. Los botones "Activar todo" y "Desactivar todo" cambian todos los toggles.

## Perfiles por sitio y reglas de activación
Los perfiles guardan ajustes específicos para cada dominio o subdominio. AutoScroll aplica automáticamente el perfil correspondiente al cargar una página. Si activas **Forzar subdominio**, cada subdominio tiene su propio perfil sin heredar del dominio base; es útil para sitios donde secciones usan configuraciones distintas (ej. `blog.ejemplo.com` vs `tienda.ejemplo.com`).

Las **Reglas de activación** funcionan en paralelo: permiten auto-iniciar el autoscroll solo en URLs permitidas (o bloquear en ciertas rutas). Primero se evalúan reglas de bloqueo y luego las de permiso; si ninguna coincide, rigen los ajustes globales y el autoscroll no se inicia solo.

## Gestos y atajos de teclado
- **Hotkey iniciar/detener autoscroll:** por defecto `Shift + A`; editable en la sección **Básico**.
- **Hotkey mostrar/ocultar panel:** por defecto `Shift + H`; se cambia en **Visibilidad del panel**.
- **Gestos por clics:** habilita un número de clics consecutivos para iniciar/detener. Ajusta cantidad y ventana temporal en **Gestos y atajos**.
- **Clic medio:** pausa/reanuda al presionar el botón central (si está activado).
- **Triple clic:** puede ir al inicio, al final o alternar dirección según lo que elijas en **Gestos y atajos**.

## Importar / Exportar configuración
- **Exportar JSON:** genera un archivo con todas las opciones globales, gestos, Infinite scroll, perfiles por sitio y reglas. Útil para respaldos o migrar a otro navegador.
- **Importar JSON:** selecciona un archivo exportado previamente. El script valida y ajusta valores fuera de rango; si una clave es inválida, se ignora o se corrige al valor permitido más cercano.

## Solución de problemas frecuentes (FAQ)
- **El panel se ve muy pequeño con el zoom del navegador:** aumenta **Escala panel (%)** o **Tamaño de fuente (%)** en **Apariencia**.
- **El panel se sale de la pantalla:** el panel se clampa automáticamente; si ocurre, arrástralo y la posición se reajusta al soltar.
- **Infinite scroll no funciona en un sitio:** revisa que **Activar Infinite scroll** esté encendido, aumenta el **Timeout (ms)** y añade un **Selector loader** si el sitio usa un indicador personalizado.
- **Los gestos no responden:** confirma que **Activar autoscroll por clics** o la opción de **Clic medio** estén activadas y que ningún otro script/bloqueador intercepte los eventos.

## Desarrollo y testing (para contribuidores)
- Clona el repositorio y entra al directorio: `git clone https://github.com/MatiasRDev/AutoScroll.git && cd AutoScroll`.
- Comandos básicos:
  - `npm install`
  - `npm run build`
  - `npm test`
- El bundle publicado se genera a partir de `src/autoscroll.source.js` y se empaqueta en `autoscroll.user.js` mediante `npm run build`.

## Licencia
MIT
