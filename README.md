# AutoScroll (Userscript)

AutoScroll suave con panel configurable: gestos (clics / triple clic), pausa inteligente, tira lateral, secciones, infinite scroll, perfiles por sitio, PSL-lite + override y UI personalizable.

 **Nota:** el infinite scroll viene desactivado por defecto. Actívalo manualmente desde el panel (Configuración → Scroll infinito) cuando quieras usarlo.

## Instalación

1. Instala Tampermonkey (Chrome/Edge/Firefox).
2. [Instalar en Tampermonkey](https://github.com/MatiasRDev/AutoScroll/raw/main/autoscroll.user.js)

## Desarrollo

La descripción pública coincide con la usada en `autoscroll.user.js` y se mantiene al generar el bundle.

1. Instala dependencias: `npm install`.
2. Genera el installer/bundle con `npm run build`, que ejecuta `scripts/build.mjs`.

## Testing

Las pruebas usan Vitest con `jsdom` como entorno DOM. Para ejecutarlas:

```bash
npm test
```

## Atajos por defecto
- Shift + A → Iniciar/Detener
- Shift + H → Mostrar/Ocultar panel
- Clic medio → Pausar/Reanudar (opcional)

## Licencia
MIT
