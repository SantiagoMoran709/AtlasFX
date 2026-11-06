# Funciones disponibles

Los menús presentan acciones implementadas. Se desactivan cuando falta una selección, un medio o un estado necesario. Las pistas bloqueadas y los límites del medio se validan en el núcleo; los comandos fallidos conservan el estado anterior.

| Área | Acciones implementadas |
| --- | --- |
| Archivo | Crear proyecto, abrir recientes, importar medios/proyectos, guardar localmente, descargar .vedit, copia de seguridad .vedit, exportar video, metadatos CSV, fotograma PNG, configuración de proyecto, adoptar resolución del medio, notas y organizador |
| Edición | Deshacer, rehacer, historial con restauración de estados, cortar/copiar, pegar insertando, pegar sobrescribiendo, pegar en pista nueva, pegar atributos, duplicar, eliminar, eliminar cerrando el espacio en esa pista, cerrar huecos en pistas desbloqueadas y cancelar selección |
| Recortar | Seleccionar clip más cercano, inspector de recortes, recortar inicio/final al cursor, mover un fotograma y deslizar la entrada del medio un fotograma |
| Línea de tiempo | Dividir, unir dos cortes contiguos compatibles, insertar espacio, añadir pistas de video/audio, insertar títulos editables, aplicar transiciones de video y fundidos de entrada/salida |
| Clip | Separar audio de un video, restablecer transformación, silenciar/activar audio y añadir medio al final |
| Efectos | Insertar subtítulos manuales, transcribir un clip, editar tipografía, abrir filtros de color y Chroma key |
| Marcar | Añadir marcador, ir al anterior/siguiente y quitar el marcador bajo el cursor |
| Ver | Ajustar visor, 50 %, 100 %, pantalla completa, biblioteca, mezclador, histograma/color y medidor Master |
| Reproducir | Reproducir/pausar, detener al inicio, avanzar/retroceder un fotograma, ir a cortes, ir a un tiempo y bucle |

## Semántica de edición

- Las acciones se aplican al clip seleccionado. Todavía no hay selección múltiple.
- Pegar insertando divide el clip bajo el cursor y desplaza el contenido posterior en esa pista. Sobrescribir conserva las partes que quedan fuera del intervalo pegado.
- Unir requiere dos cortes del mismo medio, contiguos en el timeline y en el archivo, con las mismas propiedades y sin fundidos interiores.
- Insertar espacio afecta todas las pistas desbloqueadas. Eliminar y cerrar espacio afecta solo la pista del clip seleccionado.
- La disolvencia cruzada y el barrido se aplican entre clips de imagen o video contiguos en la misma pista. El efecto se centra en el corte y conserva la duración de los clips y el corte de audio.
- El botón Texto inserta un título en el cursor. Se edita el contenido, tamaño, color, posición y negrita desde el Inspector.
- Edición → Doble visor alterna entre uno y dos visores. El panel inferior mantiene accesibles las pestañas Inspector, Audio y Color.
- Efectos → Chroma key… quita el fondo de un clip por color y deja ver las pistas inferiores. Los ajustes de color de fondo, tolerancia, suavizado y reflejo se guardan por clip y se aplican al exportar.
- En la aplicación de escritorio abierta desde la carpeta del proyecto, selecciona un clip de audio o video y usa Efectos → Subtítulos automáticos…. La primera transcripción descarga el modelo Whisper. El audio se procesa localmente. Cada clip puede durar hasta 5 minutos y su archivo de origen hasta 30 minutos y 512 MB.
- Los subtítulos aparecen como clips editables en una pista de subtítulos. Selecciona uno y abre Efectos → Editar tipografía para cambiar fuente, tamaño, color, posición o negrita.
- Separar audio crea un clip editable en una pista de audio con los mismos tiempos y recortes. El video queda silenciado y ambos clips se pueden mover y recortar por separado.
- Cada proyecto admite hasta 100 pistas entre video, audio y títulos. La fluidez con varias capas simultáneas depende del equipo, la resolución y los códecs.
- El histograma RGB se calcula del fotograma visible, con normalización independiente de los canales. La corrección es SDR básica mediante filtros de Canvas 2D.
- .vedit y las copias de seguridad guardan referencias y parámetros; conserva también los medios originales.

## Funciones de las referencias aún pendientes

Las capturas corresponden a una suite profesional más amplia. Continúan pendientes las bandejas inteligentes, múltiples secuencias por proyecto, selección múltiple, intercambios AAF/EDL/XML, multicámara, edición con velocidad variable, voz en off, edición vinculada de clips separados, nodos y ruedas Lift/Gamma/Gain/Offset, LUT, máscaras, efectos de Fusion, EQ/dinámica, LUFS y true peak, funciones de IA, DCP, nube y colaboración. Tampoco hay instalador firmado ni exportación nativa FFmpeg.

La exportación sigue siendo en tiempo real. Para medios cuyo audio puede decodificarse dentro del presupuesto de memoria, se programa el audio en Web Audio. En la ruta alternativa de streaming pueden aparecer cortes y se muestra un aviso. No se ha validado sincronía A/V en material largo.
