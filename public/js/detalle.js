const $ =
  id =>
    document.getElementById(
      id
    );


/* ==========================================================
   ESTADO
   ========================================================== */

let current =
  null;


let visibleGalleryPhotos =
  [];


let filteredGalleryPhotos =
  [];


let activeGalleryParams =
  null;


let activeGalleryTitle =
  "";


let renderLimit =
  120;


const selectedPhotoIds =
  new Set();


/* ==========================================================
   UTILIDADES
   ========================================================== */

function splitPipe(
  value
) {

  return String(
    value ||
    ""
  )

    .split(
      "|"
    )

    .map(
      value =>
        value.trim()
    )

    .filter(
      Boolean
    );
}


/* ==========================================================
   FOTO ID
   ========================================================== */

function photoIdFromPath() {

  const queryId =
    new URLSearchParams(
      location.search
    )
      .get(
        "foto"
      );


  if (
    queryId?.trim()
  ) {

    return queryId.trim();
  }


  const parts =
    location.pathname

      .split(
        "/"
      )

      .filter(
        Boolean
      );


  if (
    parts[0] ===
      "foto"

    &&

    parts[1]
  ) {

    return decodeURIComponent(
      parts[1]
    );
  }


  return null;
}


/* ==========================================================
   URL IMAGEN
   ========================================================== */

function imageUrl(
  photo
) {

  return (

    `/api/image?foto_id=` +

    encodeURIComponent(
      photo.foto_id
    )
  );
}


/* ==========================================================
   URL DESCARGA
   ========================================================== */

function downloadUrl(
  photo
) {

  return (

    `/api/download?foto_id=` +

    encodeURIComponent(
      photo.foto_id
    )
  );
}


/* ==========================================================
   FETCH JSON
   ========================================================== */

async function fetchJson(
  url
) {

  const response =
    await fetch(

      url,

      {
        cache:
          "no-store"
      }
    );


  if (
    !response.ok
  ) {

    const body =
      await response

        .json()

        .catch(
          () => ({})
        );


    throw new Error(

      body.error

      ||

      `HTTP ${response.status}`
    );
  }


  return response.json();
}


/* ==========================================================
   PROMOTOR / COORDINADOR
   ========================================================== */

function roleLabel(
  photo
) {

  const type =
    String(
      photo?.tipo_reporte ||
      ""
    )

      .trim()

      .toLowerCase();


  return (
    type ===
      "coordinador"
  )

    ?

    "Coordinador"

    :

    "Promotor";
}


/* ==========================================================
   MUNICIPIO
   ========================================================== */

function municipalityOf(
  photo
) {

  const own =
    String(
      photo?.municipio ||
      ""
    )
      .trim();


  if (own) {

    return own;
  }


  const values =
    splitPipe(
      photo?.municipios_relacionados
    );


  return (
    values.length ===
      1
  )

    ?

    values[0]

    :

    "";
}


/* ==========================================================
   LUGAR PRINCIPAL
   ========================================================== */

function primaryPlace(
  photo
) {

  if (

    photo?.tipo_asociacion ===
      "EXACTA"

    &&

    photo?.localidad

  ) {

    return photo.localidad;
  }


  return (

    municipalityOf(
      photo
    )

    ||

    "Territorio TPBV"
  );
}


/* ==========================================================
   ORDENAR / QUITAR REPETIDOS
   ========================================================== */

function uniqueSorted(
  values
) {

  return [

    ...new Set(

      values

        .map(

          value =>

            String(
              value ||
              ""
            )

              .trim()
        )

        .filter(
          Boolean
        )
    )
  ]

    .sort(

      (
        a,
        b
      ) =>

        a.localeCompare(

          b,

          "es",

          {
            sensitivity:
              "base"
          }
        )
    );
}


/* ==========================================================
   MENSAJES
   ========================================================== */

function setStatus(
  message,
  persistent = false
) {

  const element =
    $("downloadStatus");


  if (!element) {

    return;
  }


  element.textContent =
    message;


  element
    .classList
    .remove(
      "hidden"
    );


  clearTimeout(
    setStatus.timer
  );


  if (
    !persistent
  ) {

    setStatus.timer =
      setTimeout(

        () =>

          element
            .classList
            .add(
              "hidden"
            ),

        4500
      );
  }
}


/* ==========================================================
   FOTO PRINCIPAL
   ========================================================== */

function setMainImage(
  photo
) {

  const img =
    $("selectedPhoto");


  const skeleton =
    $("selectedSkeleton");


  img
    .classList
    .remove(
      "loaded"
    );


  skeleton
    .classList
    .remove(
      "hidden"
    );


  img.onload =
    () => {

      img
        .classList
        .add(
          "loaded"
        );


      skeleton
        .classList
        .add(
          "hidden"
        );
    };


  img.onerror =
    () => {

      skeleton
        .classList
        .add(
          "hidden"
        );


      setStatus(
        "No fue posible cargar la fotografía."
      );
    };


  img.src =
    imageUrl(
      photo
    );
}


/* ==========================================================
   TODAS LAS FOTOS DE LOCALIDAD / MUNICIPIO
   ========================================================== */

async function fetchAllGalleryPhotos(
  params
) {

  const result =
    [];


  let offset =
    0;


  while (
    true
  ) {

    const query =
      new URLSearchParams({

        action:
          "fotos",

        limit:
          "500",

        offset:
          String(
            offset
          ),

        ...params
      });


    const data =
      await fetchJson(

        `/api/data?${query}`
      );


    const items =
      data.items ||
      [];


    result.push(
      ...items
    );


    if (

      data.nextOffset ===
        null

      ||

      data.nextOffset ===
        undefined

      ||

      !items.length

    ) {

      break;
    }


    offset =
      data.nextOffset;
  }


  return result;
}


/* ==========================================================
   NOMBRE TARJETA
   ========================================================== */

function cardPlace(
  photo
) {

  if (
    photo.localidad
  ) {

    return photo.localidad;
  }


  const locations =
    splitPipe(
      photo.localidades_relacionadas
    );


  if (
    locations.length ===
      1
  ) {

    return locations[0];
  }


  return (

    municipalityOf(
      photo
    )

    ||

    "TPBV"
  );
}


/* ==========================================================
   SELECCIONAR / DESELECCIONAR
   ========================================================== */

function togglePhotoSelection(
  photo
) {

  if (

    selectedPhotoIds
      .has(
        photo.foto_id
      )

  ) {

    selectedPhotoIds
      .delete(
        photo.foto_id
      );
  }

  else {

    selectedPhotoIds
      .add(
        photo.foto_id
      );
  }


  updateSelectionUI();
}


/* ==========================================================
   ACTUALIZAR SELECCIÓN
   ========================================================== */

function updateSelectionUI() {

  const count =
    selectedPhotoIds.size;


  if (
    $("selectedCount")
  ) {

    $("selectedCount")
      .textContent =

      `${count} seleccionada${
        count === 1
          ? ""
          : "s"
      }`;
  }


  $("selectionDock")
    ?.classList
    .toggle(

      "hidden",

      count ===
        0
    );


  if (
    $("downloadSelectedTopBtn")
  ) {

    $("downloadSelectedTopBtn")
      .disabled =

      count ===
        0;
  }


  document
    .querySelectorAll(
      ".gallery-card"
    )

    .forEach(

      card => {

        const selected =
          selectedPhotoIds
            .has(
              card.dataset.photoId
            );


        card
          .classList
          .toggle(

            "selected",

            selected
          );


        card
          .setAttribute(

            "aria-pressed",

            selected
              ? "true"
              : "false"
          );
      }
    );
}


/* ==========================================================
   CREAR TARJETA
   ========================================================== */

function createGalleryCard(
  photo
) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    "gallery-card";


  card.dataset.photoId =
    photo.foto_id;


  card.tabIndex =
    0;


  card.setAttribute(

    "role",

    "button"
  );


  card.setAttribute(

    "aria-label",

    `Seleccionar fotografía de ${cardPlace(photo)}`
  );


  /* ========================================================
     INDICADOR DE SELECCIÓN
     ======================================================== */

  const selector =
    document.createElement(
      "span"
    );


  selector.className =
    "select-photo";


  selector.setAttribute(

    "aria-hidden",

    "true"
  );


  selector.innerHTML =
    "<span>✓</span>";


  /* ========================================================
     IMAGEN
     ======================================================== */

  const img =
    document.createElement(
      "img"
    );


  img.loading =
    "lazy";


  img.src =
    imageUrl(
      photo
    );


  img.alt =

    `Fotografía de ${cardPlace(photo)}`;


  /* ========================================================
     PIE DE TARJETA
     ======================================================== */

  const body =
    document.createElement(
      "div"
    );


  body.className =
    "gallery-card-body";


  const title =
    document.createElement(
      "strong"
    );


  title.textContent =
    cardPlace(
      photo
    );


  /* ========================================================
     BOTÓN DESCARGAR INDIVIDUAL
     SOLO ICONO
     ======================================================== */

  const download =
    document.createElement(
      "a"
    );


  download.className =
    "gallery-download";


  download.href =
    downloadUrl(
      photo
    );


  download.title =
    "Descargar fotografía";


  download.setAttribute(

    "aria-label",

    "Descargar fotografía"
  );


  /*
   * AQUÍ ESTÁ EL CAMBIO:
   *
   * Ya NO tiene:
   *
   * <span>Descargar</span>
   *
   * Únicamente mostramos el ícono.
   */

  download.innerHTML = `

      <svg
        viewBox="0 0 24 24"
        aria-hidden="true">

        <path
          d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.9"
          stroke-linecap="round"
          stroke-linejoin="round"/>

      </svg>
  `;


  /*
   * Descargar NO selecciona la tarjeta.
   */

  download
    .addEventListener(

      "click",

      event => {

        event.stopPropagation();
      }
    );


  /* ========================================================
     ARMAR TARJETA
     ======================================================== */

  body.append(

    title,

    download
  );


  card.append(

    selector,

    img,

    body
  );


  /* ========================================================
     TODA LA TARJETA SELECCIONA
     ======================================================== */

  card
    .addEventListener(

      "click",

      event => {

        if (

          event.target
            .closest(
              "a"
            )

        ) {

          return;
        }


        togglePhotoSelection(
          photo
        );
      }
    );


  /* ========================================================
     TECLADO
     ======================================================== */

  card
    .addEventListener(

      "keydown",

      event => {

        if (

          event.key ===
            "Enter"

          ||

          event.key ===
            " "

        ) {

          event
            .preventDefault();


          togglePhotoSelection(
            photo
          );
        }
      }
    );


  return card;
}


/* ==========================================================
   RENDER GALERÍA
   ========================================================== */

function renderGallery() {

  const gallery =
    $("gallery");


  gallery.innerHTML =
    "";


  if (
    !filteredGalleryPhotos.length
  ) {

    $("galleryEmpty")
      ?.classList
      .remove(
        "hidden"
      );


    $("loadMoreBtn")
      ?.classList
      .add(
        "hidden"
      );


    return;
  }


  $("galleryEmpty")
    ?.classList
    .add(
      "hidden"
    );


  const fragment =
    document
      .createDocumentFragment();


  filteredGalleryPhotos

    .slice(
      0,
      renderLimit
    )

    .forEach(

      photo => {

        fragment.append(

          createGalleryCard(
            photo
          )
        );
      }
    );


  gallery.append(
    fragment
  );


  const loadMore =
    $("loadMoreBtn");


  const pending =

    filteredGalleryPhotos.length

    -

    renderLimit;


  loadMore
    ?.classList
    .toggle(

      "hidden",

      pending <=
        0
    );


  if (

    loadMore

    &&

    pending >
      0

  ) {

    loadMore.textContent =

      `Cargar más (${pending} restantes)`;
  }


  updateSelectionUI();
}


/* ==========================================================
   BUSCADOR
   ========================================================== */

function applyGallerySearch() {

  const query =
    String(

      $("gallerySearch")
        ?.value

      ||

      ""
    )

      .trim()

      .toLocaleLowerCase(
        "es"
      );


  filteredGalleryPhotos =

    !query

      ?

      visibleGalleryPhotos

      :

      visibleGalleryPhotos
        .filter(

          photo => {

            const text =

              [

                cardPlace(
                  photo
                ),

                photo.municipio,

                photo.localidad,

                photo.foto_id

              ]

                .join(
                  " "
                )

                .toLocaleLowerCase(
                  "es"
                );


            return text
              .includes(
                query
              );
          }
        );


  renderLimit =
    120;


  renderGallery();
}


/* ==========================================================
   CARGAR GALERÍA
   ========================================================== */

async function loadGallery(

  params,

  title

) {

  activeGalleryParams =
    {
      ...params
    };


  activeGalleryTitle =
    title;


  renderLimit =
    120;


  selectedPhotoIds
    .clear();


  $("gallerySection")
    ?.classList
    .remove(
      "hidden"
    );


  $("galleryTitle")
    .textContent =

    "Cargando fotografías…";


  $("galleryCount")
    .textContent =
    "";


  $("galleryScopeHelp")
    .textContent =

    "Cargando todas las fotografías disponibles…";


  $("gallery")
    .innerHTML =
    "";


  $("loadMoreBtn")
    ?.classList
    .add(
      "hidden"
    );


  updateSelectionUI();


  try {

    const items =
      await fetchAllGalleryPhotos(
        params
      );


    visibleGalleryPhotos =
      items;


    filteredGalleryPhotos =
      items;


    $("galleryTitle")
      .textContent =
      title;


    $("galleryCount")
      .textContent =
      String(
        items.length
      );


    const scope =

      params.localidad

      ||

      params.municipio

      ||

      "este territorio";


    $("galleryScopeHelp")
      .textContent =

      `${items.length} fotografía${
        items.length === 1
          ? ""
          : "s"
      } en ${scope}. Toca cualquier imagen para seleccionarla.`;


    $("downloadAllScopeText")
      .textContent =

      params.localidad

        ?

        "Descargar toda la localidad"

        :

        "Descargar todo el municipio";


    $("gallerySearch")
      .value =
      "";


    renderGallery();


    setTimeout(

      () =>

        $("gallerySection")
          ?.scrollIntoView({

            behavior:
              "smooth",

            block:
              "start"
          }),

      40
    );


  } catch (error) {

    console.error(
      error
    );


    $("galleryTitle")
      .textContent =

      "No se pudieron cargar las fotografías";


    $("galleryScopeHelp")
      .textContent =

      error.message;


    setStatus(
      error.message
    );
  }
}


/* ==========================================================
   BOTÓN LOCALIDAD
   ========================================================== */

function localityButton(
  name
) {

  const button =
    document.createElement(
      "button"
    );


  button.className =
    "locality-choice";


  button.type =
    "button";


  button.innerHTML = `

      <span
        class="locality-choice-icon">

        •

      </span>

      <span></span>

      <span
        class="locality-choice-arrow">

        ›

      </span>
  `;


  button.children[1]
    .textContent =
    name;


  button.onclick =
    () =>

      loadGallery(

        {
          localidad:
            name
        },

        `Fotos de ${name}`
      );


  return button;
}


/* ==========================================================
   RELACIONES
   ========================================================== */

function renderRelated() {

  const section =
    $("relatedSection");


  const choices =
    $("localityChoices");


  const municipalityBtn =
    $("municipalityBtn");


  choices.innerHTML =
    "";


  municipalityBtn
    .classList
    .add(
      "hidden"
    );


  const municipality =
    municipalityOf(
      current
    );


  /* ========================================================
     EXACTA
     ======================================================== */

  if (

    current.tipo_asociacion ===
      "EXACTA"

    &&

    current.localidad

  ) {

    section
      .classList
      .remove(
        "hidden"
      );


    $("relatedTitle")
      .textContent =

      "Explora esta localidad";


    $("relatedCount")
      .textContent =
      "";


    $("relatedHelp")
      .textContent =

      "Consulta, selecciona o descarga todas las fotografías de esta localidad.";


    choices.append(

      localityButton(
        current.localidad
      )
    );
  }


  /* ========================================================
     NO EXACTA
     ======================================================== */

  else {

    const localities =
      uniqueSorted(

        splitPipe(
          current.localidades_relacionadas
        )
      );


    if (
      localities.length
    ) {

      section
        .classList
        .remove(
          "hidden"
        );


      $("relatedTitle")
        .textContent =

        "Localidades relacionadas";


      $("relatedCount")
        .textContent =

        String(
          localities.length
        );


      $("relatedHelp")
        .textContent =

        localities.length ===
          1

          ?

          "Entra a la localidad para consultar o descargar todas sus fotografías."

          :

          "Elige una localidad para consultar, seleccionar o descargar sus fotografías.";


      localities
        .forEach(

          locality =>

            choices.append(

              localityButton(
                locality
              )
            )
        );
    }


    else {

      const municipalities =
        uniqueSorted(

          splitPipe(
            current.municipios_relacionados
          )
        );


      if (
        municipalities.length
      ) {

        section
          .classList
          .remove(
            "hidden"
          );


        $("relatedTitle")
          .textContent =

          "Municipios relacionados";


        $("relatedCount")
          .textContent =

          String(
            municipalities.length
          );


        $("relatedHelp")
          .textContent =

          "Elige un municipio para consultar o descargar sus fotografías.";


        municipalities
          .forEach(

            municipalityName => {

              const button =
                localityButton(
                  municipalityName
                );


              button.onclick =
                () =>

                  loadGallery(

                    {
                      municipio:
                        municipalityName
                    },

                    `Fotos de ${municipalityName}`
                  );


              choices.append(
                button
              );
            }
          );
      }
    }
  }


  /* ========================================================
     VER TODO EL MUNICIPIO
     ======================================================== */

  if (
    municipality
  ) {

    $("municipalityBtnText")
      .textContent =
      municipality;


    municipalityBtn
      .classList
      .remove(
        "hidden"
      );


    municipalityBtn.onclick =
      () =>

        loadGallery(

          {
            municipio:
              municipality
          },

          `Fotos de ${municipality}`
        );
  }
}


/* ==========================================================
   ZIP
   ========================================================== */

const CRC_TABLE =
  (() => {

    const table =
      new Uint32Array(
        256
      );


    for (
      let n = 0;
      n < 256;
      n++
    ) {

      let c =
        n;


      for (
        let k = 0;
        k < 8;
        k++
      ) {

        c =

          (
            c & 1
          )

            ?

            (
              0xEDB88320
              ^
              (
                c >>>
                  1
              )
            )

            :

            (
              c >>>
                1
            );
      }


      table[n] =
        c >>> 0;
    }


    return table;
  })();


function crc32(
  bytes
) {

  let crc =
    -1;


  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {

    crc =

      (
        crc >>>
          8
      )

      ^

      CRC_TABLE[

        (
          crc
          ^
          bytes[i]
        )

        &

        0xFF
      ];
  }


  return (

    crc
    ^
    -1

  ) >>> 0;
}


const u16 =
  value =>

    new Uint8Array([

      value &
        255,

      (
        value >>>
          8
      )
      &
        255
    ]);


const u32 =
  value =>

    new Uint8Array([

      value &
        255,

      (
        value >>>
          8
      )
      &
        255,

      (
        value >>>
          16
      )
      &
        255,

      (
        value >>>
          24
      )
      &
        255
    ]);


function concatBytes(
  parts
) {

  const length =
    parts.reduce(

      (
        sum,
        part
      ) =>

        sum +
        part.length,

      0
    );


  const output =
    new Uint8Array(
      length
    );


  let offset =
    0;


  for (
    const part
    of parts
  ) {

    output.set(

      part,

      offset
    );


    offset +=
      part.length;
  }


  return output;
}


/* ==========================================================
   NOMBRE DE ARCHIVO
   ========================================================== */

function safeFilename(
  name
) {

  return String(

    name

    ||

    "foto.jpg"
  )

    .replace(

      /[<>:"/\\|?*\x00-\x1F]+/g,

      "_"
    )

    .slice(
      0,
      145
    );
}


function uniqueFilename(

  name,

  used

) {

  const clean =
    safeFilename(
      name
    );


  const dot =
    clean.lastIndexOf(
      "."
    );


  const base =

    dot > 0

      ?

      clean.slice(
        0,
        dot
      )

      :

      clean;


  const extension =

    dot > 0

      ?

      clean.slice(
        dot
      )

      :

      "";


  let candidate =
    clean;


  let number =
    2;


  while (

    used.has(
      candidate.toLowerCase()
    )

  ) {

    candidate =

      `${base}_${number++}${extension}`;
  }


  used.add(
    candidate.toLowerCase()
  );


  return candidate;
}


/* ==========================================================
   CREAR ZIP
   ========================================================== */

function makeStoredZip(
  files
) {

  const encoder =
    new TextEncoder();


  const localParts =
    [];


  const centralParts =
    [];


  let offset =
    0;


  const now =
    new Date();


  const year =
    Math.max(

      1980,

      now.getFullYear()
    );


  const dosTime =

    (
      now.getHours()
      <<
        11
    )

    |

    (
      now.getMinutes()
      <<
        5
    )

    |

    Math.floor(

      now.getSeconds()
      /
        2
    );


  const dosDate =

    (
      (
        year -
          1980
      )
      <<
        9
    )

    |

    (
      (
        now.getMonth()
        +
          1
      )
      <<
        5
    )

    |

    now.getDate();


  for (
    const file
    of files
  ) {

    const nameBytes =
      encoder.encode(
        file.name
      );


    const data =
      file.data;


    const crc =
      crc32(
        data
      );


    const local =
      concatBytes([

        u32(
          0x04034b50
        ),

        u16(
          20
        ),

        u16(
          0x0800
        ),

        u16(
          0
        ),

        u16(
          dosTime
        ),

        u16(
          dosDate
        ),

        u32(
          crc
        ),

        u32(
          data.length
        ),

        u32(
          data.length
        ),

        u16(
          nameBytes.length
        ),

        u16(
          0
        ),

        nameBytes,

        data
      ]);


    localParts.push(
      local
    );


    const central =
      concatBytes([

        u32(
          0x02014b50
        ),

        u16(
          20
        ),

        u16(
          20
        ),

        u16(
          0x0800
        ),

        u16(
          0
        ),

        u16(
          dosTime
        ),

        u16(
          dosDate
        ),

        u32(
          crc
        ),

        u32(
          data.length
        ),

        u32(
          data.length
        ),

        u16(
          nameBytes.length
        ),

        u16(
          0
        ),

        u16(
          0
        ),

        u16(
          0
        ),

        u16(
          0
        ),

        u32(
          0
        ),

        u32(
          offset
        ),

        nameBytes
      ]);


    centralParts.push(
      central
    );


    offset +=
      local.length;
  }


  const centralSize =
    centralParts.reduce(

      (
        sum,
        part
      ) =>

        sum +
        part.length,

      0
    );


  const end =
    concatBytes([

      u32(
        0x06054b50
      ),

      u16(
        0
      ),

      u16(
        0
      ),

      u16(
        files.length
      ),

      u16(
        files.length
      ),

      u32(
        centralSize
      ),

      u32(
        offset
      ),

      u16(
        0
      )
    ]);


  return new Blob(

    [

      ...localParts,

      ...centralParts,

      end
    ],

    {

      type:
        "application/zip"
    }
  );
}


/* ==========================================================
   PREPARAR FOTO PARA ZIP
   ========================================================== */

async function fetchPhotoForZip(
  photo
) {

  const response =
    await fetch(
      imageUrl(
        photo
      )
    );


  if (
    !response.ok
  ) {

    return null;
  }


  const data =
    new Uint8Array(

      await response
        .arrayBuffer()
    );


  const contentType =
    response.headers
      .get(
        "content-type"
      )

    ||

    "";


  let extension =
    ".jpg";


  if (
    contentType.includes(
      "png"
    )
  ) {

    extension =
      ".png";
  }


  else if (

    contentType.includes(
      "webp"
    )

  ) {

    extension =
      ".webp";
  }


  const base =
    String(

      photo.nombre_archivo

      ||

      photo.foto_id
    )

      .replace(

        /\.[^.]+$/,

        ""
      );


  return {

    proposedName:

      `${base}${extension}`,


    data
  };
}


/* ==========================================================
   DESCARGA MASIVA
   ========================================================== */

async function downloadPhotosAsZip(

  photos,

  filename

) {

  if (
    !photos.length
  ) {

    setStatus(
      "No hay fotografías para descargar."
    );


    return;
  }


  setStatus(

    `Preparando ${photos.length} fotografías. No cierres esta página…`,

    true
  );


  const files =
    [];


  const usedNames =
    new Set();


  let nextIndex =
    0;


  let completed =
    0;


  const concurrency =
    4;


  async function worker() {

    while (
      true
    ) {

      const index =
        nextIndex++;


      if (
        index >=
          photos.length
      ) {

        return;
      }


      const photo =
        photos[index];


      try {

        const result =
          await fetchPhotoForZip(
            photo
          );


        if (
          result
        ) {

          files.push({

            name:

              uniqueFilename(

                result.proposedName,

                usedNames
              ),


            data:

              result.data
          });
        }


      } catch (error) {

        console.error(

          "Error preparando",

          photo.foto_id,

          error
        );
      }


      completed++;


      if (

        completed ===
          photos.length

        ||

        completed %
          5 ===
          0

      ) {

        setStatus(

          `Preparando ${completed} de ${photos.length}…`,

          true
        );
      }
    }
  }


  await Promise.all(

    Array.from(

      {

        length:

          Math.min(

            concurrency,

            photos.length
          )
      },

      worker
    )
  );


  if (
    !files.length
  ) {

    throw new Error(

      "No fue posible preparar ninguna fotografía."
    );
  }


  setStatus(

    `Creando ZIP con ${files.length} fotografías…`,

    true
  );


  const blob =
    makeStoredZip(
      files
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const anchor =
    document.createElement(
      "a"
    );


  anchor.href =
    url;


  anchor.download =
    filename;


  document.body.appendChild(
    anchor
  );


  anchor.click();


  anchor.remove();


  setTimeout(

    () =>

      URL.revokeObjectURL(
        url
      ),

    30000
  );


  setStatus(

    `ZIP preparado: ${files.length} fotografías.`
  );
}


/* ==========================================================
   OBTENER SELECCIONADAS
   ========================================================== */

function selectedPhotos() {

  return visibleGalleryPhotos
    .filter(

      photo =>

        selectedPhotoIds.has(
          photo.foto_id
        )
    );
}


/* ==========================================================
   DESCARGAR SELECCIONADAS
   ========================================================== */

async function downloadSelected() {

  const items =
    selectedPhotos();


  if (
    !items.length
  ) {

    setStatus(

      "Primero selecciona una o más fotografías."
    );


    return;
  }


  const safeTitle =
    (
      activeGalleryTitle

      ||

      "fotos"
    )

      .replace(

        /[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g,

        "_"
      )

      .slice(
        0,
        80
      );


  try {

    await downloadPhotosAsZip(

      items,

      `TPBV_${safeTitle}_seleccionadas.zip`
    );


  } catch (error) {

    console.error(
      error
    );


    setStatus(
      error.message
    );
  }
}


/* ==========================================================
   DESCARGAR TODA LOCALIDAD / MUNICIPIO
   ========================================================== */

async function downloadAllCurrentScope() {

  if (
    !visibleGalleryPhotos.length
  ) {

    setStatus(

      "No hay fotografías para descargar."
    );


    return;
  }


  const scope =

    activeGalleryParams
      ?.localidad

    ||

    activeGalleryParams
      ?.municipio

    ||

    "territorio";


  const safeScope =
    String(
      scope
    )

      .replace(

        /[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g,

        "_"
      )

      .slice(
        0,
        80
      );


  try {

    await downloadPhotosAsZip(

      visibleGalleryPhotos,

      `TPBV_${safeScope}_todas.zip`
    );


  } catch (error) {

    console.error(
      error
    );


    setStatus(
      error.message
    );
  }
}


/* ==========================================================
   INICIALIZAR
   ========================================================== */

async function init() {

  const fotoId =
    photoIdFromPath();


  if (
    !fotoId
  ) {

    $("detailPlace")
      .textContent =

      "Fotografía no especificada";


    $("detailIntro")
      .textContent =

      "El enlace no contiene el identificador de una fotografía.";


    $("selectedSkeleton")
      ?.classList
      .add(
        "hidden"
      );


    return;
  }


  try {

    current =
      await fetchJson(

        `/api/data?action=foto&id=${encodeURIComponent(fotoId)}`
      );


  } catch (error) {

    console.error(
      error
    );


    $("detailPlace")
      .textContent =

      "Fotografía no encontrada";


    $("detailIntro")
      .textContent =

      error.message;


    $("selectedSkeleton")
      ?.classList
      .add(
        "hidden"
      );


    return;
  }


  setMainImage(
    current
  );


  const municipality =
    municipalityOf(
      current
    );


  const role =
    roleLabel(
      current
    );


  const person =
    current.usuario_origen
    ||
    "";


  const related =
    uniqueSorted(

      splitPipe(
        current.localidades_relacionadas
      )
    );


  $("detailPlace")
    .textContent =

    primaryPlace(
      current
    );


  $("detailRole")
    .textContent =
    role;


  $("selectedContext")
    .textContent =

    municipality

    ||

    "TPBV";


  $("downloadCurrentBtn")
    .href =

    downloadUrl(
      current
    );


  if (

    current.tipo_asociacion ===
      "EXACTA"

  ) {

    $("detailIntro")
      .textContent =

      person

        ?

        `${role}: ${person}`

        :

        "Fotografía de Territorios de Paz y Buen Vivir.";
  }


  else {

    const relation =

      related.length

        ?

        `Reporte relacionado con ${related.length} localidad${
          related.length === 1
            ? ""
            : "es"
        }.`

        :

        "Fotografía relacionada con este territorio.";


    $("detailIntro")
      .textContent =

      person

        ?

        `${relation} ${role}: ${person}.`

        :

        relation;
  }


  renderRelated();


  /* ========================================================
     BUSCADOR
     ======================================================== */

  $("gallerySearch")
    ?.addEventListener(

      "input",

      applyGallerySearch
    );


  /* ========================================================
     CARGAR MÁS
     ======================================================== */

  $("loadMoreBtn")
    ?.addEventListener(

      "click",

      () => {

        renderLimit +=
          120;


        renderGallery();
      }
    );


  /* ========================================================
     SELECCIONAR TODAS
     ======================================================== */

  $("selectAllBtn")
    .onclick =
    () => {

      filteredGalleryPhotos
        .forEach(

          photo =>

            selectedPhotoIds
              .add(
                photo.foto_id
              )
        );


      updateSelectionUI();


      renderGallery();
    };


  /* ========================================================
     LIMPIAR
     ======================================================== */

  $("clearSelectionBtn")
    .onclick =
    () => {

      selectedPhotoIds
        .clear();


      updateSelectionUI();


      renderGallery();
    };


  /* ========================================================
     DESCARGAR SELECCIONADAS
     ======================================================== */

  $("downloadSelectedBtn")
    .onclick =

    downloadSelected;


  $("downloadSelectedTopBtn")
    .onclick =

    downloadSelected;


  /* ========================================================
     DESCARGAR TODO
     ======================================================== */

  $("downloadAllScopeBtn")
    .onclick =

    downloadAllCurrentScope;
}


/* ==========================================================
   EJECUTAR
   ========================================================== */

init();