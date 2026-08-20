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

function getCarouselWindow(
  rawIndex
) {

  const data =
    loadCatalog();


  const total =
    data.carousel.length;


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
        data.carousel[
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
        data.carousel[
          index
        ]
      ],


    next:

      data.photos[
        data.carousel[
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
   EXPORTAR
   ========================================================== */

module.exports = {

  loadCatalog,

  getPhoto,

  getCarouselWindow,

  getPhotosBy
};