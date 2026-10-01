TPBV - PROTECCION LOCAL DE DESCARGA DE FOTOGRAFIAS CON MENORES
===============================================================

OBJETIVO
- El usuario final NO decide si hay menores.
- La clasificacion se realiza previamente en la computadora responsable.
- Todo corre LOCALMENTE: ninguna fotografia se envia a servicios de IA.
- Las fotos con menores se ven con los rostros difuminados y no se pueden
  descargar. /api/download tambien valida la proteccion del lado del servidor.

COMO FUNCIONA
1. Detector de rostros (YuNet, OpenCV, licencia MIT): ubica las caras.
   Solo dice "aqui hay una cara"; NO identifica a nadie.
2. Estimador de edad (ViT entrenado con FairFace, licencia Apache 2.0):
   estima un rango de edad por cara.
3. Regla por fotografia:
   - Alguna cara claramente de menor          -> CON_MENORES
   - Alguna cara con edad incierta             -> REVISAR (persona decide)
   - Todas las caras claramente adultas o
     sin caras visibles                        -> SIN_MENORES
   Caras de menos de 16 px (multitudes lejanas) no cuentan para decidir.
4. En fotos protegidas se difuminan TODAS las caras: el estimador de edad
   falla con caras pequenas y asi no se escapa ningun menor.

Velocidad aproximada: 2 a 3 segundos por foto (unas 3 horas para 5,000).
La primera vez descarga los modelos (~90 MB) a la carpeta models/.

IMPORTANTE
Ningun modelo puede garantizar la edad de una persona por una fotografia.
Por eso existe la revision humana (paso 4), que es parte del proceso.

PASO 1 - PRUEBA
  04_PRUEBA_MENORES_20.bat
Analiza 20 fotos y genera/reanuda data/revision_menores.csv.

PASO 2 - CLASIFICACION COMPLETA
  04_CLASIFICAR_MENORES_LOCAL.bat
Guarda el avance; si se interrumpe, al volver a ejecutarlo continua.

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
- Las coordenadas de los rostros quedan en la columna "caras" de
  data/revision_menores.csv (4 numeros por cara, nada mas).
- 05_REVISAR_DUDOSAS.bat tiene dos etapas:
    1) Dudosas: 1 = contiene menores, 2 = no contiene menores
    2) Verificar difuminado (se ve igual que en publico):
       1 = correcto, 2 = se ve algun rostro -> difuminar foto completa,
       3 = en realidad no contiene menores
- La etapa 2 es necesaria: el detector no ve caras de perfil muy marcado
  o de espaldas, y el estimador de edad a veces marca adultos como menores
  (tecla 3 para liberarlas).

NOTA
Ningun modelo visual puede garantizar por una fotografia la edad exacta de una persona.
Por eso el proceso usa REVISAR para casos ambiguos y el responsable humano toma la
decision final en esos casos.
