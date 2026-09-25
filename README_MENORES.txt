TPBV - PROTECCION LOCAL DE DESCARGA DE FOTOGRAFIAS CON MENORES
===============================================================

OBJETIVO
- El usuario final NO decide si hay menores.
- La clasificacion se realiza previamente en la computadora responsable.
- La IA de vision corre LOCALMENTE con Ollama + Qwen2.5-VL 7B.
- Las fotos dudosas quedan bloqueadas temporalmente y se revisan manualmente.
- Las fotografias protegidas siguen visibles, pero no se pueden descargar.
- /api/download tambien valida la proteccion del lado del servidor.

IMPORTANTE SOBRE PRIVACIDAD
- El analisis de IA se hace en http://127.0.0.1:11434 (Ollama local).
- No usa OPENAI_API_KEY y no envia las imagenes a OpenAI ni a otro servicio de IA.
- El script SI descarga una miniatura desde el Google Drive que ya usa el proyecto,
  porque las fotografias originales viven ahi.
- La miniatura se mantiene en memoria durante el analisis; no se crea una copia
  permanente local por cada fotografia.

PASO 1 - DIAGNOSTICO
Ejecuta:
  03_DIAGNOSTICO_IA_LOCAL.bat

Este paso revisa RAM, CPU, GPU NVIDIA, Ollama y si esta instalado qwen2.5vl:7b.
No analiza ninguna fotografia.

Si falta Ollama, instalalo desde:
  https://ollama.com/download

Si falta el modelo, ejecuta una vez:
  ollama pull qwen2.5vl:7b

El modelo ocupa aproximadamente 6 GB en disco.

PASO 2 - PRUEBA CON 20 FOTOS
Ejecuta:
  04_PRUEBA_MENORES_20.bat

Genera/reanuda:
  data/revision_menores.csv

Resultados posibles:
  SIN_MENORES
  CON_MENORES
  REVISAR

Si quieres repetir la prueba desde cero, elimina temporalmente
  data/revision_menores.csv
antes de volver a ejecutar la prueba.

PASO 3 - CLASIFICACION COMPLETA
Cuando confirmemos que la velocidad y los resultados de las primeras fotos son buenos:
  04_CLASIFICAR_MENORES_LOCAL.bat

El proceso guarda el avance foto por foto. Si se interrumpe, al volver a ejecutarlo
continua con las pendientes.

PASO 4 - REVISAR DUDOSAS
Ejecuta:
  05_REVISAR_DUDOSAS.bat

Abre en el navegador:
  http://localhost:4317

Teclas:
  1 = contiene menores
  2 = no contiene menores

PASO 5 - PUBLICAR
Ya no es obligatorio correr 06_APLICAR_REVISION_MENORES.bat.
"npm run build" (y el build de Vercel) lee data/revision_menores.csv
directamente y aplica la proteccion.

IMPORTANTE: data/revision_menores.csv SE SUBE A GITHUB. Si no se sube,
Vercel publica el catalogo sin proteccion.

Mientras exista data/revision_menores.csv, TODA foto que no tenga un
veredicto final (nueva, REVISAR o con error) queda BLOQUEADA para descarga.
Se puede publicar aunque falten dudosas por revisar: nunca se expone una foto
sin clasificar.

LOTES NUEVOS (fotos que lleguen despues)
1. 01_CARGAR_NUEVO_CATALOGO.bat con el CSV nuevo.
   La revision anterior NO se pierde: vive en data/revision_menores.csv.
2. 04_CLASIFICAR_MENORES_LOCAL.bat -> solo analiza las fotos nuevas.
3. 05_REVISAR_DUDOSAS.bat
4. Commit + push (catalogo, revision_menores.csv y generated/).

EVENTOS
El catalogo acepta tres columnas opcionales:
  evento        nombre visible, ej. "Jornada de Salud Anenecuilco"
  evento_id     opcional; si viene, agrupa por este id en vez del nombre
  fecha_evento  opcional, ej. 2026-10-05
Si el lote trae "evento":
- el carrusel muestra el nombre del evento sobre la foto;
- la pagina del QR muestra el evento y el boton "Ver todo el evento",
  con descarga del evento completo en ZIP.
Si dos eventos distintos pueden llamarse igual, usar evento_id
(ej. AYALA-2026-10-05-SALUD).
Las fotos actuales no traen evento y se ven igual que antes.

EQUIPO SIN GPU NVIDIA
En una laptop sin GPU NVIDIA el modelo 7b puede tardar mucho por foto.
Corre primero la prueba de 20 fotos: muestra segundos por foto y el tiempo
estimado. Si es demasiado, en .env.local cambia a:
  OLLAMA_VISION_MODEL=qwen2.5vl:3b
y ejecuta: ollama pull qwen2.5vl:3b

COMPORTAMIENTO FINAL
SIN_MENORES:
  se ve normal y se descarga normal

CON_MENORES (y dudosas o pendientes):
  se ve con los ROSTROS DIFUMINADOS y no se puede descargar
  Mensaje: "Esta fotografia no esta disponible para descarga directa.
  Si deseas obtenerla, solicitala con tu promotor."

- El difuminado se hace en el servidor: el celular nunca recibe la
  foto original, ni el enlace de Drive.
- Si no se ubicaron rostros, se difumina la FOTO COMPLETA. Esas fotos
  aparecen en las galerias (con candado) pero no se proyectan en el carrusel.
- Las descargas de seleccionadas, localidad, municipio y evento excluyen
  automaticamente las fotografias protegidas.

DIFUMINADO DE ROSTROS
- El clasificador, ademas de decidir, ubica los rostros de cada foto
  protegida (columna "caras" de data/revision_menores.csv).
  Se difuminan TODOS los rostros de la foto, no solo los de menores:
  la edad por rostro no es confiable y asi no se escapa ninguno.
- 05_REVISAR_DUDOSAS.bat tiene dos etapas:
    1) Dudosas: 1 = contiene menores, 2 = no contiene menores
    2) Verificar difuminado (se ve igual que en publico):
       1 = correcto, 2 = se ve algun rostro -> difuminar foto completa,
       3 = en realidad no contiene menores
- Revisar la etapa 2 es muy recomendable: el modelo puede no ver
  rostros pequenos o lejanos.

NOTA
Ningun modelo visual puede garantizar por una fotografia la edad exacta de una persona.
Por eso el proceso usa REVISAR para casos ambiguos y el responsable humano toma la
decision final en esos casos.
