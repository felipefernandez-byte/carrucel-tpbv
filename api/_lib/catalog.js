const fs =
  require("node:fs");

const path =
  require("node:path");


let cache =
  null;


/* ==========================================================
   NORMALIZAR TEXTO
   ========================================================== */

function norm(value) {

  return String(
    value ?? ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /\p{Diacritic}/gu,
      ""
    )
    .trim()
    .toLocaleLowerCase(
      "es-MX"
    )
    .replace(
      /\s+/g,
      " "
    );
}


/* ==========================================================
   CARGAR CATÁLOGO
   ========================================================== */

function loadCatalog() {

  if (cache) {

    return cache;
  }


  const file =
    path.join(
      process.cwd(),
      "generated",
      "catalog.min.json"
    );


  cache =
    JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );


  return cache;
}


/* ==========================================================
   BUSCAR UNA FOTO
   ========================================================== */

function getPhoto(fotoId) {

  const data =
    loadCatalog();


  const index =
    data.byId[
      String(
        fotoId ||
        ""
      )
    ];


  if (
    index ===
    undefined
  ) {

    return null;
  }


  return (
    data.photos[index] ||
    null
  );
}


/* ==========================================================
   CARRUSEL
   ========================================================== */

/*
 * Orden revuelto del carrusel. Cada pantalla elige una semilla al abrirse y
 * el servidor revuelve la lista siempre igual para esa semilla: así la foto N
 * es la misma en cada consulta y ninguna se repite hasta que pasen todas.
 * Sin semilla se usa el orden del catálogo.
 */
const shuffledBySeed =
  new Map();

function shuffledCarousel(
  carousel,
  rawSeed
) {

  const seed =
    Number.parseInt(
      rawSeed,
      10
    );

  if (
    !Number.isSafeInteger(seed) ||
    seed <= 0
  ) {

    return carousel;
  }

  if (
    shuffledBySeed.has(seed)
  ) {

    return shuffledBySeed.get(seed);
  }

  // mulberry32: generador pequeño y repetible a partir de la semilla.
  let state =
    seed >>> 0;

  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Fisher-Yates.
  const order =
    carousel.slice();

  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // Pocas pantallas a la vez: se guardan solo las semillas recientes.
  if (shuffledBySeed.size >= 20) {
    shuffledBySeed.delete(
      shuffledBySeed.keys().next().value
    );
  }

  shuffledBySeed.set(seed, order);

  return order;
}

function getCarouselWindow(
  rawIndex,
  rawSeed
) {

  const data =
    loadCatalog();

  const carousel =
    shuffledCarousel(
      data.carousel,
      rawSeed
    );


  const total =
    carousel.length;


  if (!total) {

    return {

      total: 0,

      index: 0,

      prev: null,

      current: null,

      next: null
    };
  }


  const parsed =
    Number(
      rawIndex ||
      0
    );


  const index =
    (
      (
        Number.isFinite(
          parsed
        )
          ? parsed
          : 0
      )
      %
      total
      +
      total
    )
    %
    total;


  return {

    total,

    index,


    prev:

      data.photos[
        carousel[
          (
            index -
            1 +
            total
          )
          %
          total
        ]
      ],


    current:

      data.photos[
        carousel[
          index
        ]
      ],


    next:

      data.photos[
        carousel[
          (
            index +
            1
          )
          %
          total
        ]
      ]
  };
}


/* ==========================================================
   FOTOS POR LOCALIDAD / MUNICIPIO
   CON PAGINACIÓN
   ========================================================== */

function getPhotosBy({

  localidad,

  municipio,

  evento,

  limit = 250,

  offset = 0

}) {

  const data =
    loadCatalog();


  let indexes =
    [];


  /* ==============================
     LOCALIDAD
     ============================== */

  if (localidad) {

    indexes =
      data.localities[
        norm(
          localidad
        )
      ]
      ||
      [];
  }


  /* ==============================
     EVENTO
     ============================== */

  else if (evento) {

    indexes =
      (data.events || {})[
        norm(
          evento
        )
      ]
      ||
      [];
  }


  /* ==============================
     MUNICIPIO
     ============================== */

  else if (municipio) {

    indexes =
      data.municipalities[
        norm(
          municipio
        )
      ]
      ||
      [];
  }


  /* ==============================
     OFFSET
     ============================== */

  const safeOffset =
    Math.max(
      0,
      Number(
        offset
      )
      ||
      0
    );


  /* ==============================
     LÍMITE
     ============================== */

  const safeLimit =
    Math.max(

      1,

      Math.min(

        Number(
          limit
        )
        ||
        250,

        500
      )
    );


  /* ==============================
     RESULTADOS
     ============================== */

  const items =
    indexes

      .slice(

        safeOffset,

        safeOffset +
        safeLimit
      )

      .map(

        index =>

          data.photos[
            index
          ]
      );


  /* ==============================
     SIGUIENTE PÁGINA
     ============================== */

  const nextOffset =

    (
      safeOffset +
      items.length
    )
    <
    indexes.length

      ?

      safeOffset +
      items.length

      :

      null;


  return {

    total:

      indexes.length,


    offset:

      safeOffset,


    limit:

      safeLimit,


    nextOffset,


    items
  };
}


/* ==========================================================
   VERSIÓN PÚBLICA DE UNA FOTO
   ========================================================== */

/*
 * En fotos protegidas no se publica el enlace de Drive
 * (permitiría ver el original sin difuminar), ni la
 * observación del modelo, ni las coordenadas de rostros.
 */
function publicPhoto(
  photo
) {

  if (
    !photo ||
    String(
      photo.permitir_descarga ||
      ""
    )
      .trim()
      .toUpperCase() !==
    "NO"
  ) {

    return photo;
  }


  const {
    drive_file_id,
    drive_view_url,
    nombre_archivo,
    observacion_revision_menores,
    confianza_revision_menores,
    fuente_revision_menores,
    caras,
    ...safe
  } =
    photo;


  return safe;
}


/* ==========================================================
   EXPORTAR
   ========================================================== */

module.exports = {

  loadCatalog,

  getPhoto,

  getCarouselWindow,

  getPhotosBy,

  publicPhoto
};