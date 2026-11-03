# CruzamientosMT

Webapp para comprobar en campo si una **distancia de conductores o partes en tensión** es defecto, según las guías de revisión de e-distribución (ene-2026):

- **AED017 V6** – Líneas aéreas de MT
- **FED030 V6** – Centros de transformación intemperie (PT)
- **FED029 V7** – Centros de transformación tipo edificio (CD)

## Comprobaciones incluidas

**Líneas MT:** G23B (cruce con líneas eléctricas/telecom), GA2B (distancia horizontal a apoyos), G53B (carreteras), G58B (FF.CC. sin electrificar), G81B (FF.CC. electrificado), G61B (ríos y canales), G71B (teleféricos), L21B (vegetación), L22B (árbol con riesgo de caída), L31B / L32B (edificios accesibles / inaccesibles), L33B (edificio en proyección horizontal), L61B (terreno).

**PT:** L37C (edificaciones), L21C (vegetación), D12C (altura partes en tensión), D21C (altura masa del trafo), X12C (separación entre fases).

**CD:** X11D (embarrado interior), V41D / V42D (distancias y alturas de protecciones de celdas), V23D (anchura de pasillos), V25D (iluminación a menos de 1 m de MT).

## Cómo usar

1. Rellena arriba la instalación, la **fecha de puesta en servicio**, la tensión y el tipo de conductor. La app decide sola si aplica el reglamento anterior o posterior (líneas: 19/03/2010, centros: 09/06/2016, L33B: 2001).
2. Abre la comprobación, mete la medida y verás al momento si es defecto, el mínimo aplicado y de dónde sale.
3. Pulsa **Añadir al informe** con el apoyo o ubicación. En la pestaña **Informe** puedes compartirlo por WhatsApp, exportarlo a Excel (CSV) o copiarlo.

Los datos se guardan en el propio móvil (no se envían a ningún sitio).

## Publicación en GitHub Pages

Sube `index.html`, `styles.css`, `script.js` y `README.md` a la rama `main` del repositorio y activa **Settings → Pages → Branch: main / root**.

## Nota

Herramienta de ayuda. Ante la duda manda la guía y aporta siempre fotografías de campo.
