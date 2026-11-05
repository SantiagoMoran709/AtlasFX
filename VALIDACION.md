# Validación de la primera versión

Verificaciones realizadas el 5 de noviembre de 2026 en este equipo:

- Compilación de producción con TypeScript estricto y Vite: correcta.
- Comprobación de tipos de los tres paquetes: correcta.
- Vitest: 10 pruebas del núcleo aprobadas.
- Navegador: importar imagen de ejemplo, añadirla al timeline, reproducir, dividir, recortar desde el inspector, deshacer y rehacer.
- Persistencia: reabrir el proyecto tras una recarga y recuperar sus medios desde IndexedDB.
- Exportación: generar MP4 H.264/AAC de una secuencia de 5 segundos, descargarlo e importarlo de nuevo; duración reconocida de 5.0 segundos, imagen reconocida de 854 × 480.
- Se corrigió durante esta prueba un fallo de duración en secuencias sin audio. La exportación mantiene ahora una fuente de silencio activa en el mezclador para conservar el reloj del contenedor.
- Electron: abrir la compilación web en una ventana nativa, verificar visualmente el editor y el indicador de guardado local. Perfil de datos exclusivo `CorteStudio`, instancia única y CSP en producción.

Las comprobaciones de navegador fueron manuales a través de controles de la interfaz. No son una suite E2E automatizada. No se ha medido sincronía A/V con señales de referencia, ni probado material 4K, proyectos largos, exportación con varias fuentes de audio o todos los códecs. La exportación nativa por FFmpeg y los instaladores siguen pendientes.

## Actualización visual

- Se verificó la compilación del diseño compacto con dos monitores.
- Se importó un MP4 desde la biblioteca y se reprodujo en el monitor de origen.
- Se verificó el cambio entre uno y dos monitores y la inserción de un clip desde el monitor de origen.
- Se comprobó la selección del nuevo clip en el timeline y sus propiedades en el inspector.

- La vista usa un monitor por defecto. La opción de dos monitores se movió a Ajustes; se verificó su persistencia activándola, recargando y comprobando que el monitor de origen seguía visible. Después se desactivó para dejar la vista con un solo monitor.
- Se revisaron visualmente las esquinas suavizadas, la separación entre paneles y el contraste de los bordes.

## Biblioteca de proyectos y tema unificado

- Se comprobó la biblioteca en una vista estrecha y en una vista de escritorio de 1440 px.
- Buscar por nombre redujo la lista de dos proyectos a uno; se verificó la alternancia cuadrícula/lista.
- Se verificaron el formulario de creación, la apertura de un proyecto existente y la creación de «Mi proyecto» desde el nuevo formulario.
- El tema se consolidó en un único CSS, con paneles redondeados, tipografía mayor y acento turquesa.
- Se retiraron la ilustración de muestra y el texto superpuesto del monitor vacío. El compositor limpia el visor en negro cuando no hay clips activos.

## Visor, inspector inferior, mezclador y menús

- Compilación web y validación de sintaxis Electron correctas. Vitest: 24 pruebas del núcleo aprobadas (14 nuevas para insertar/sobrescribir, duplicar, ripple delete, cerrar huecos, recortar, unir, insertar espacio, límites de mezcla/color y serialización).
- Se verificó que 100 % muestra 1920 × 1080 píxeles CSS para un proyecto 1920 × 1080. Adoptar la resolución de una imagen 320 × 180 y usar 100 % produjo exactamente 320 × 180; deshacer restauró la resolución anterior.
- WAV de prueba estéreo de 4 s, 48 kHz: seno de amplitud 0.25 en L y 0.5 en R. Los medidores mostraron aproximadamente -12 y -6 dBFS. El fader a -60 dB llevó las barras y lecturas a silencio. A +6 dB el pico Master se aproximó a 0 dBFS.
- Duplicar desde Edición produjo dos clips; deshacer restauró uno. Añadir un marcador creó un marcador visible en la regla. Se verificaron los diálogos de notas y configuración por la acción de adoptar resolución.
- Un PNG de prueba RGB (100, 40, 20) con exposición +2 EV generó un fotograma PNG 1920 × 1080 cuyo centro fue RGBA (255, 160, 80, 255).
- Se exportó MP4 H.264/AAC de 5 s a 854 × 480 con Master -6 dB. Se decodificó el archivo mediante una herramienta FFmpeg usada solo para QA. Picos L/R: -17.98 / -11.97 dBFS; RMS L/R: -21.05 / -15.03 dBFS en el tramo 0.7–2.7 s, conforme a la señal y ganancia esperadas. Ventanas de 100 ms confirmaron señal continua hasta terminar el audio de 4 s, seguida de silencio. Duración del archivo: 4.97 s (diferencia de un fotograma respecto de 5 s). Color del centro del MP4: RGB (255, 165, 75), con la variación esperable de la codificación con pérdida.
- Se detectaron y corrigieron cortes en exportaciones basadas en audio de elementos HTML. Los medios decodificables dentro de 192 MiB estimados de PCM usan fuentes programadas sobre el reloj de Web Audio; la ruta alternativa de streaming muestra un aviso de continuidad limitada.
- Descargar el .vedit conservó notas, un marcador, Master 0.501187 (-6 dB), resolución del proyecto y exposición +2 EV. Los proyectos anteriores siguen aceptando los campos opcionales nuevos.
- Evidencia de exportación en `output/validacion-audio-color.json` y `output/validacion-audio-color.mp4`. La herramienta FFmpeg de QA no forma parte del producto ni habilita la exportación nativa pendiente.

Límites de esta comprobación: no es una suite E2E automatizada; no se midió sincronía A/V con señales de referencia, ni continuidad en proyectos de una hora, códecs especiales, muchas capas o la ruta alternativa de streaming.

## Plan por fases

- **Fase 0, base técnica.** El modelo conserva el formato `.vedit` y valida los cambios sobre proyectos inmutables. Las 32 pruebas cubren, entre otros casos, 100 ediciones consecutivas con deshacer y rehacer, comandos agrupados, recortes y conversiones de fotogramas a microsegundos. ESLint, Prettier y la compilación de producción pasan.
- **Fase 1, medios y reproducción.** La biblioteca muestra los FPS medios de los MP4 cuando están disponibles. Se conservan los códecs, la presencia de audio y la rotación en los metadatos. La vista previa precarga el siguiente segundo y limita la caché de medios inactivos a 12 elementos.
- **Prueba de reproducción.** Electron reprodujo 301 segundos de un MP4 sintético H.264/AAC de 640 × 360 a 30 fps. Se detectaron 60 pares de destello y pitido con un desfase máximo observado de 21 ms. La memoria residente del proceso de renderizado osciló entre 44.5 y 49.6 MiB en las muestras de los últimos minutos.
- **Pendiente para cerrar la fase 1.** Verificar la memoria durante diez minutos continuos y completar la ruta WebCodecs en worker con composición WebGL. La prueba anterior mide el visor y el mezclador actuales. La exportación en segundo plano sigue sujeta a pérdidas de fotogramas en la ruta en tiempo real.
