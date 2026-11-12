# AtlasFX

[![Descargar AtlasFX para Windows](https://img.shields.io/badge/DESCARGAR_ATLASFX-PARA_WINDOWS-2F7466?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/SantiagoMoran709/AtlasFX/releases/download/v0.1.0/AtlasFX-0.1.0-Windows-x64.zip)

**Descargá el ZIP, extraé toda la carpeta y abrí `AtlasFX.exe`.**

[Ver la versión publicada y sus archivos](https://github.com/SantiagoMoran709/AtlasFX/releases/latest)

Editor de video multipista para web y escritorio. Incluye interfaz en español, edición local y un núcleo TypeScript independiente de React.

## Descargar y abrir en Windows x64

Descarga el ZIP **AtlasFX-0.1.0-Windows-x64.zip** desde [GitHub Releases](https://github.com/SantiagoMoran709/AtlasFX/releases/latest). La opción **Code → Download ZIP** descarga el código fuente.
En el equipo de destino, extrae todo el ZIP y abre `AtlasFX/AtlasFX.exe`.
El paquete incluye Electron y el editor compilado y funciona sin instalar Node.js o pnpm.
Conserva juntos los archivos de la carpeta extraída.

El paquete no tiene una firma de publicación propia de AtlasFX. Una descarga nueva puede
mostrar un aviso de reputación de SmartScreen. Consulta la [guía de Microsoft sobre SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## Abrir desde el código fuente

- Doble clic en **Abrir editor.cmd** para abrir la versión web en el navegador.
- Doble clic en **AtlasFX.exe** en la carpeta del proyecto para abrir la versión de escritorio.

Los accesos requieren las dependencias instaladas. El de escritorio requiere también una compilación web previa. Las dos versiones mantienen bibliotecas locales separadas.

## Desarrollo

Requisitos: Node.js 22.12 o superior y pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Abre http://127.0.0.1:5173/. Para escritorio:

```sh
pnpm build
pnpm desktop
```

Para generar el ZIP de distribución desde Windows x64:

```sh
pnpm package:win
```

Comprobaciones:

```sh
pnpm test
pnpm typecheck
pnpm build
```

## Sitio de presentación

Abre `site/index.html` directamente o usa `site/` como carpeta pública de un entorno estático.

## Interfaz de edición

La biblioteca de proyectos ocupa una pantalla completa, con miniaturas locales, búsqueda, orden por fecha o nombre y vistas de cuadrícula/lista. **Nuevo proyecto** permite elegir un nombre antes de abrir el editor. La selección de un proyecto se confirma con **Abrir proyecto** o doble clic.

La interfaz utiliza una paleta de negro y gris neutro con acento turquesa y un único archivo de tema (`apps/web/src/theme.css`). Los clips de video, imagen y audio se distinguen por azul desaturado, lavanda y verde salvia, respectivamente.

La distribución incluye una biblioteca con miniaturas, una línea de tiempo con pistas de 72 px y un panel inferior fijo con las pestañas Inspector, Audio y Color. En **Ver → Biblioteca de medios** puedes mostrar u ocultar la biblioteca. Se usa un solo visor por defecto. En **Edición → Doble visor** puedes mostrar el visor de origen junto al de programa. Esta preferencia se conserva en el navegador o en el perfil de Electron. Los paneles, controles y clips usan bordes suavizados.

Haz clic en un medio de la biblioteca para revisarlo en el monitor de origen. Los videos y audios tienen reproducción y búsqueda independientes. **Añadir clip** inserta el archivo completo al final de una pista compatible. Al reproducir el programa, se pausa el monitor de origen.

## Flujo de uso

1. Importa video, audio o imágenes. El monitor empieza en negro, sin imágenes de muestra.
2. Pulsa `+` sobre un medio, haz doble clic o arrástralo a una pista compatible.
3. Mueve los clips, arrastra sus bordes para recortar y pulsa `S` para dividir en el cursor. Los solapes se rechazan sin alterar el proyecto.
4. Ajusta posición temporal, entrada, duración, escala, rotación, opacidad y volumen en el inspector. Confirma los campos con Enter o al salir del campo.
5. Abre **Exportar video**, elige la resolución, los FPS, el formato y la calidad, y pulsa **Renderizar y revisar**. Reproduce el resultado para observar su cadencia antes de usar **Guardar video**. Si el render detecta una demora, podés saltar al primer punto señalado.

Atajos: Espacio reproduce/pausa; S o Ctrl+B divide; Supr elimina; Ctrl+Z deshace; Ctrl+Shift+Z rehace; flechas desplazan un fotograma; J retrocede un segundo; K pausa; L reproduce hacia delante; +/- cambia zoom; Ctrl+S guarda localmente; Ctrl+Shift+S descarga .vedit; Ctrl+I importa medios; Ctrl+C/X/V copia, corta y pega clips; Ctrl+D duplica; Shift+Supr elimina y cierra el espacio en esa pista; Ctrl+E abre exportación.

## Visor, mezclador y menús

- **Zoom del visor** ofrece Ajustar, 25 %, 50 %, 100 % y 200 %. Al 100 %, cada píxel del proyecto ocupa un píxel CSS y aparecen barras de desplazamiento si hace falta. No modifica el archivo exportado. Para adoptar las dimensiones de un archivo usa **Archivo → Usar resolución del medio seleccionado**.
- El panel inferior tiene **Inspector**, **Audio** y **Color**. En Audio, los faders de cada pista y Master van de silencio a +6 dB; el volumen de escucha bajo el visor solo afecta los altavoces.
- Los medidores usan muestras reales de Web Audio y muestran picos de muestra en dBFS. No calculan LUFS ni true peak. El indicador de pico se puede restablecer.
- El color básico permite exposición, contraste, saturación y matiz. El histograma RGB analiza el canvas del programa; cada canal se normaliza por separado. Estos ajustes y los fundidos se aplican también al exportar.
- Consulta **FUNCIONES.md** para el inventario de acciones de los menús y las funciones profesionales pendientes.

### Audio de exportación

Se decodifican los medios compatibles y se programan fuentes de audio y sus fundidos sobre el reloj de Web Audio, con un presupuesto estimado de 192 MiB. Esto mantiene el audio independiente del ritmo de dibujo de la interfaz. Para medios que superan ese presupuesto o que no se pueden decodificar completamente, se usa streaming del navegador. El diálogo avisa que esa ruta puede presentar cortes.

### MP4 con FFmpeg en Windows

Coloca un `ffmpeg.exe` de confianza junto a `AtlasFX.exe` en la carpeta del ZIP extraído, o agrégalo al PATH. La compilación de FFmpeg debe incluir `libx264` y `aac`. Reinicia AtlasFX y selecciona **MP4 · FFmpeg (escritorio)** en **Exportar video**. El ZIP de AtlasFX funciona por sí solo con los formatos integrados. [Descargas de FFmpeg](https://ffmpeg.org/download.html)

Esta opción conserva la composición y mezcla de AtlasFX, captura en tiempo real y después codifica un MP4 H.264/AAC mediante FFmpeg. La revisión y el guardado siguen disponibles. La cadencia de la captura todavía depende del equipo.

## Guardado y medios

Los proyectos y copias de los medios se guardan en IndexedDB con autoguardado tras las ediciones (600 ms de espera). La pantalla de proyectos permite crear, abrir y eliminar proyectos locales. Eliminar un proyecto de la lista no elimina sus medios de la caché.

**Guardar proyecto** conserva el estado en IndexedDB. **Archivo → Descargar proyecto como .vedit** descarga un JSON validado y versionado. Incluye los parámetros de edición y referencias a medios, pero no los archivos originales. Para trasladarlo a otro equipo, conserva los originales y usa **Reubicar** sobre los medios faltantes. No borres los datos del navegador sin tener estos respaldos. No hay subida de video a un servidor.

## Estructura

- `packages/core`: modelo, invariantes, comandos inmutables, historial, serialización y pruebas.
- `apps/web`: React 18 + Vite, Zustand, biblioteca, timeline, inspector, compositor Canvas 2D, persistencia y exportación.
- `apps/desktop`: ventana Electron con aislamiento de contexto, sandbox y Node desactivado en el renderer. Comparte la compilación web.
- `scripts`: accesos para abrir ambas versiones en Windows.

## Alcance real de esta entrega

Esta es una base de producto, no la implementación completa de las 17 páginas. Permite verificar el flujo importar → editar → reproducir → exportar. El compositor usa Canvas 2D y elementos multimedia del navegador, compartidos por preview y exportación. La reproducción usa el reloj de Web Audio cuando está disponible; se busca en los medios al activar un clip, al hacer scrub o al cambiar su entrada. La decodificación de video sigue dependiendo de elementos HTML, sin garantías de sincronía A/V por fotograma.

La exportación usa MediaRecorder y captura de canvas **en tiempo real**: una secuencia de un minuto tarda aproximadamente un minuto. Mantén la ventana activa. El FPS configurado es un objetivo de captura; el archivo puede tener cadencia variable y perder cuadros según la carga. No es exportación determinista por fotograma, y la mezcla de videos consecutivos puede mostrar saltos al cargar o buscar medios. Las opciones de resolución son 480p/720p/1080p, con orientación adaptada al proyecto. La compatibilidad de MP4 se detecta al abrir el diálogo.

Pendiente del diseño original:

- Demux MP4, WebCodecs, caché limitada por GOP, workers, WebGL y sincronización A/V determinista.
- Composición determinista por fotograma y audio en bloques para medios largos.
- Separar media, renderer, audio, playback, export, platform y ui en paquetes con adaptadores inyectables.
- Filtros avanzados, keyframes, velocidad, ondas de audio y proxies. Ya hay títulos editables, disolvencia cruzada, barrido, fundidos lineales del clip y corrección básica de color.
- Paneles redimensionables, selección múltiple, múltiples secuencias por proyecto y virtualización. Los ajustes de resolución y FPS ya están disponibles.
- OPFS para archivos grandes, migraciones futuras, copias de recuperación y limpieza de caché.
- Instalador, firma de publicación y actualizaciones automáticas de Electron.
- Pruebas de sincronía A/V, rendimiento, códecs variados y navegador de extremo a extremo automatizadas.

El patrón de seguridad de Electron sigue la [documentación oficial de Electron](https://www.electronjs.org/docs/latest/tutorial/security). El entorno de compilación sigue los [requisitos de Vite](https://vite.dev/guide/).
