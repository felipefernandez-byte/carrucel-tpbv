TPBV - VERCEL UNIFICADO v5.0
============================================================

ESTE ES UN SOLO PROYECTO
------------------------
Ahora Vercel publica LAS DOS PARTES:

  /carrusel
    -> Carrusel para la pantalla/proyector.
    -> Animación 3D basada en la referencia de Stitch.
    -> Flechas.
    -> Avance cada 10 segundos.
    -> Clic en foto central = pausar/continuar.
    -> QR dinámico de la foto actual.

  /foto/FOTO-XXXXX
    -> Página móvil que abre el QR.
    -> Fotografía.
    -> Descargar.
    -> Localidades relacionadas.
    -> Municipio.
    -> Explorar otras fotografías.
    -> Selección múltiple.

YA NO NECESITAS
---------------
- server.py
- INICIAR_PUBLICO.bat
- cloudflared.exe
- trycloudflare.com
- tener el servidor Python abierto en la laptop
- estar en la misma red Wi-Fi

La laptop del evento solamente abre:

  https://TU-PROYECTO.vercel.app/carrusel

El celular abre:

  https://TU-PROYECTO.vercel.app/foto/FOTO-XXXXX


ANTES DE SUBIR A GITHUB
============================================================

PASO 1 - TIPOGRAFIAS
--------------------
Ejecuta:

  00_PREPARAR_FUENTES.bat

Busca el fonts.zip que ya tienes y prepara:

- Karol Sans
- Quetzalli Sans
- Twogether Sans


PASO 2 - PONER TU NUEVO CATALOGO SHA-256
----------------------------------------
MUY IMPORTANTE.

Este ZIP trae solamente el pequeño catálogo de demostración para que
la estructura no quede vacía.

Como ya terminaste la nueva reorganización, ejecuta:

  01_CARGAR_NUEVO_CATALOGO.bat

Se abrirá una ventana.

Selecciona EL NUEVO CSV FINAL generado por el reorganizador.

El BAT:

1. valida columnas;
2. lo copia como:
     data\catalogo_carrusel.csv
3. ejecuta:
     npm run build
4. genera:
     generated\catalog.min.json

Cuando diga:

  NUEVO CATALOGO LISTO PARA GITHUB / VERCEL

ya puedes subir el proyecto.


PASO 3 - VARIABLES DE GOOGLE
----------------------------
NO metas token.json ni credentials.json en GitHub.

En Vercel tendrás que crear:

  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_REFRESH_TOKEN

Si quieres obtenerlas fácilmente desde tu token.json ejecuta:

  02_PREPARAR_ENV_LOCAL.bat

Este crea un .env.local para que puedas ver/copiar los valores.

IMPORTANTE:
.env.local está ignorado por Git y NO debe subirse.


SUBIR A GITHUB
============================================================

Sube ESTA carpeta descomprimida al repositorio.

NO subas:
- token.json
- credentials.json
- .env.local
- node_modules


SUBIR A VERCEL
============================================================

1. Vercel -> Add New -> Project.
2. Importa el repositorio de GitHub.
3. Framework Preset:
     Other

4. No cambies el Build Command.
   El proyecto ya lleva:
     npm run build

5. Agrega en Environment Variables:
     GOOGLE_CLIENT_ID
     GOOGLE_CLIENT_SECRET
     GOOGLE_REFRESH_TOKEN

   Recomendado:
     Production  SI
     Preview     SI
     Development opcional

6. Deploy.


CUANDO TERMINE
============================================================

Prueba primero:

  https://TU-PROYECTO.vercel.app/

Después:

  https://TU-PROYECTO.vercel.app/carrusel

El QR de cada fotografía se genera usando AUTOMATICAMENTE el dominio
en el que está funcionando Vercel.

No tienes que escribir la URL de Vercel dentro del código.


IMPORTANTE SOBRE GOOGLE DRIVE Y VERCEL
============================================================

Vercel Functions tiene un límite de payload de aproximadamente 4.5 MB.

Por eso esta versión NO intenta mandar siempre la foto original gigante
por una Function.

Para MOSTRAR:
- Si la foto original es <= 4 MB:
    usa la original.
- Si es mayor:
    usa la miniatura autenticada de Google Drive.

Así el carrusel y el celular no deberían romperse por fotos grandes.

Para DESCARGAR:
- Original <= 4 MB:
    Vercel entrega el archivo.
- Original grande:
    se redirige a la URL de descarga de Google Drive.

Si quieres que cualquier persona pueda descargar también los originales
grandes sin iniciar sesión en Google, la carpeta de Drive que contiene
las fotos deberá permitir acceso de lectura mediante enlace, siempre que
la política de tu organización lo permita.

La selección múltiple crea el ZIP EN EL NAVEGADOR usando las copias
optimizadas que ya se muestran; el ZIP grande no pasa por una Function.


CATALOGO NUEVO
============================================================

Cuando cambie el catálogo en el futuro:

1. Ejecuta:
     01_CARGAR_NUEVO_CATALOGO.bat
2. Commit + Push a GitHub.
3. Vercel redespliega automáticamente.


RUTAS FINALES
============================================================

Inicio:
  /

Carrusel:
  /carrusel

Foto móvil:
  /foto/FOTO-XXXXX

API:
  /api/data
  /api/image
  /api/download
  /api/qr
