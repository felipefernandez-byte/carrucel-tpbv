const $ = id =>
  document.getElementById(id);

let current = null;

let visibleGalleryPhotos = [];

let filteredGalleryPhotos = [];

const selectedPhotoIds =
  new Set();

/* ==========================================================
   UTILIDADES
   ========================================================== */

function splitPipe(value) {
  return String(value || "")
    .split("|")
    .map(v => v.trim())
    .filter(Boolean);
}

/*
 * Obtiene el FOTO_ID.
 *
 * NUEVA FORMA:
 *
 * /detalle.html?foto=FOTO-XXXXX
 *
 * También dejamos soporte para:
 *
 * /foto/FOTO-XXXXX
 *
 * por compatibilidad.
 */
function photoIdFromPath() {

  /* ==============================
     1. BUSCAR EN QUERY STRING
     ============================== */

  const params =
    new URLSearchParams(
      window.location.search
    );

  const fotoQuery =
    params.get("foto");

  if (
    fotoQuery &&
    fotoQuery.trim() !== ""
  ) {
    return fotoQuery.trim();
  }


  /* ==============================
     2. COMPATIBILIDAD CON /foto/
     ============================== */

  const parts =
    window.location.pathname
      .split("/")
      .filter(Boolean);

  if (
    parts[0] === "foto" &&
    parts[1]
  ) {
    return decodeURIComponent(
      parts[1]
    );
  }


  /* ==============================
     3. NO ENCONTRADO
     ============================== */

  return null;
}


function imageUrl(photo) {

  if (
    !photo ||
    !photo.foto_id
  ) {
    return "";
  }

  return (
    `/api/image?foto_id=` +
    encodeURIComponent(
      photo.foto_id
    )
  );
}


function downloadUrl(photo) {

  if (
    !photo ||
    !photo.foto_id
  ) {
    return "#";
  }

  return (
    `/api/download?foto_id=` +
    encodeURIComponent(
      photo.foto_id
    )
  );
}


async function fetchJson(url) {

  const response =
    await fetch(
      url,
      {
        cache: "no-store"
      }
    );

  if (!response.ok) {

    const data =
      await response
        .json()
        .catch(() => ({}));

    throw new Error(
      data.error ||
      `HTTP ${response.status}`
    );
  }

  return response.json();
}


/* ==========================================================
   INFORMACIÓN DE LA FOTO
   ========================================================== */

function roleLabel(photo) {

  const tipo =
    String(
      photo?.tipo_reporte || ""
    )
      .trim()
      .toLowerCase();

  if (
    tipo === "coordinador"
  ) {
    return "Coordinador";
  }

  return "Promotor";
}


function municipalityOf(photo) {

  if (!photo) {
    return "";
  }

  const own =
    String(
      photo.municipio || ""
    ).trim();

  if (own) {
    return own;
  }

  const values =
    splitPipe(
      photo.municipios_relacionados
    );

  if (
    values.length === 1
  ) {
    return values[0];
  }

  return "";
}


function primaryPlace(photo) {

  if (!photo) {
    return "Territorio TPBV";
  }

  if (
    photo.tipo_asociacion ===
      "EXACTA" &&
    photo.localidad
  ) {
    return photo.localidad;
  }

  return (
    municipalityOf(photo) ||
    "Territorio TPBV"
  );
}


function uniqueSorted(values) {

  return [
    ...new Set(
      values
        .map(
          value =>
            String(value || "")
              .trim()
        )
        .filter(Boolean)
    )
  ].sort(
    (a, b) =>
      a.localeCompare(
        b,
        "es",
        {
          sensitivity: "base"
        }
      )
  );
}


/* ==========================================================
   MENSAJES
   ========================================================== */

function setStatus(message) {

  const element =
    $("downloadStatus");

  if (!element) {
    return;
  }

  element.textContent =
    message;

  element.classList.remove(
    "hidden"
  );

  clearTimeout(
    setStatus.timer
  );

  setStatus.timer =
    setTimeout(
      () => {

        element.classList.add(
          "hidden"
        );

      },
      3800
    );
}


/* ==========================================================
   FOTO PRINCIPAL
   ========================================================== */

function setMainImage(photo) {

  const img =
    $("selectedPhoto");

  const skeleton =
    $("selectedSkeleton");

  if (
    !img ||
    !skeleton
  ) {
    return;
  }

  img.classList.remove(
    "loaded"
  );

  skeleton.classList.remove(
    "hidden"
  );

  img.onload =
    () => {

      img.classList.add(
        "loaded"
      );

      skeleton.classList.add(
        "hidden"
      );

    };


  img.onerror =
    () => {

      skeleton.classList.add(
        "hidden"
      );

      setStatus(
        "No fue posible cargar la fotografía. Intenta nuevamente."
      );

    };


  img.src =
    imageUrl(photo);
}


/* ==========================================================
   GALERÍA
   ========================================================== */

function cardPlace(photo) {

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
    locations.length === 1
  ) {
    return locations[0];
  }

  return (
    municipalityOf(photo) ||
    "TPBV"
  );
}


function updateSelectionUI() {

  const count =
    selectedPhotoIds.size;

  const countElement =
    $("selectedCount");

  const dock =
    $("selectionDock");

  if (countElement) {

    countElement.textContent =
      `${count} seleccionada${
        count === 1
          ? ""
          : "s"
      }`;

  }

  if (dock) {

    dock.classList.toggle(
      "hidden",
      count === 0
    );

  }


  document
    .querySelectorAll(
      ".gallery-card"
    )
    .forEach(card => {

      const selected =
        selectedPhotoIds.has(
          card.dataset.photoId
        );

      card.classList.toggle(
        "selected",
        selected
      );

      const input =
        card.querySelector(
          "input"
        );

      if (input) {

        input.checked =
          selected;

      }

    });
}


function createGalleryCard(photo) {

  const card =
    document.createElement(
      "article"
    );

  card.className =
    "gallery-card";

  card.dataset.photoId =
    photo.foto_id;


  /* =========================
     SELECTOR
     ========================= */

  const selector =
    document.createElement(
      "label"
    );

  selector.className =
    "select-photo";


  const input =
    document.createElement(
      "input"
    );

  input.type =
    "checkbox";

  input.setAttribute(
    "aria-label",
    `Seleccionar ${photo.foto_id}`
  );


  const check =
    document.createElement(
      "span"
    );

  check.textContent =
    "✓";


  input.addEventListener(
    "change",
    () => {

      if (
        input.checked
      ) {

        if (
          selectedPhotoIds.size >=
          10
        ) {

          input.checked =
            false;

          setStatus(
            "Puedes seleccionar hasta 10 fotografías por ZIP."
          );

          return;
        }

        selectedPhotoIds.add(
          photo.foto_id
        );

      } else {

        selectedPhotoIds.delete(
          photo.foto_id
        );

      }

      updateSelectionUI();

    }
  );


  selector.append(
    input,
    check
  );


  /* =========================
     IMAGEN
     ========================= */

  const img =
    document.createElement(
      "img"
    );

  img.loading =
    "lazy";

  img.src =
    imageUrl(photo);

  img.alt =
    `Fotografía de ${cardPlace(photo)}`;


  /* =========================
     INFORMACIÓN
     ========================= */

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
    cardPlace(photo);


  /* =========================
     DESCARGAR
     ========================= */

  const download =
    document.createElement(
      "a"
    );

  download.className =
    "gallery-download";

  download.href =
    downloadUrl(photo);

  download.title =
    "Descargar fotografía";

  download.textContent =
    "↓";


  body.append(
    title,
    download
  );

  card.append(
    selector,
    img,
    body
  );

  return card;
}


function renderGallery(items) {

  const gallery =
    $("gallery");

  if (!gallery) {
    return;
  }

  gallery.innerHTML =
    "";


  if (
    !items.length
  ) {

    $("galleryEmpty")
      ?.classList
      .remove(
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
    document.createDocumentFragment();


  items.forEach(
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

  updateSelectionUI();
}


function applyGallerySearch() {

  const input =
    $("gallerySearch");

  if (!input) {
    return;
  }


  const query =
    String(
      input.value || ""
    )
      .trim()
      .toLocaleLowerCase(
        "es"
      );


  filteredGalleryPhotos =
    !query
      ? visibleGalleryPhotos
      : visibleGalleryPhotos
          .filter(
            photo => {

              const text =
                [
                  cardPlace(photo),
                  photo.municipio,
                  photo.localidad,
                  photo.foto_id
                ]
                  .join(" ")
                  .toLocaleLowerCase(
                    "es"
                  );

              return text.includes(
                query
              );

            }
          );


  renderGallery(
    filteredGalleryPhotos
  );
}


function showGallery(
  items,
  title,
  total
) {

  visibleGalleryPhotos =
    items;

  filteredGalleryPhotos =
    items;

  selectedPhotoIds.clear();


  $("gallerySection")
    ?.classList
    .remove(
      "hidden"
    );


  if (
    $("galleryTitle")
  ) {

    $("galleryTitle")
      .textContent =
      title;

  }


  if (
    $("galleryCount")
  ) {

    $("galleryCount")
      .textContent =
      total >
      items.length
        ? `${items.length} de ${total}`
        : `${items.length}`;

  }


  if (
    $("gallerySearch")
  ) {

    $("gallerySearch")
      .value =
      "";

  }


  renderGallery(
    items
  );

  updateSelectionUI();


  setTimeout(
    () => {

      $("gallerySection")
        ?.scrollIntoView({
          behavior:
            "smooth",

          block:
            "start"
        });

    },
    40
  );
}


async function loadGallery(
  params,
  title
) {

  try {

    $("gallerySection")
      ?.classList
      .remove(
        "hidden"
      );


    if (
      $("galleryTitle")
    ) {

      $("galleryTitle")
        .textContent =
        "Cargando fotografías…";

    }


    if (
      $("galleryCount")
    ) {

      $("galleryCount")
        .textContent =
        "";

    }


    const query =
      new URLSearchParams({
        action:
          "fotos",

        limit:
          "120",

        ...params
      });


    const data =
      await fetchJson(
        `/api/data?${query.toString()}`
      );


    showGallery(
      data.items || [],
      title,
      data.total || 0
    );

  } catch (error) {

    console.error(
      error
    );


    if (
      $("galleryTitle")
    ) {

      $("galleryTitle")
        .textContent =
        "No se pudieron cargar las fotografías";

    }


    setStatus(
      error.message
    );
  }
}


/* ==========================================================
   BOTÓN DE LOCALIDAD
   ========================================================== */

function localityButton(name) {

  const btn =
    document.createElement(
      "button"
    );

  btn.className =
    "locality-choice";

  btn.type =
    "button";


  const icon =
    document.createElement(
      "span"
    );

  icon.className =
    "locality-choice-icon";

  icon.textContent =
    "•";


  const label =
    document.createElement(
      "span"
    );

  label.textContent =
    name;


  const arrow =
    document.createElement(
      "span"
    );

  arrow.className =
    "locality-choice-arrow";

  arrow.textContent =
    "›";


  btn.append(
    icon,
    label,
    arrow
  );


  btn.onclick =
    () =>
      loadGallery(
        {
          localidad:
            name
        },
        `Fotos de ${name}`
      );


  return btn;
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


  if (
    !section ||
    !choices ||
    !municipalityBtn
  ) {
    return;
  }


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


  /* ==============================
     EXACTA
     ============================== */

  if (
    current.tipo_asociacion ===
      "EXACTA" &&
    current.localidad
  ) {

    section.classList.remove(
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
      "Consulta más fotografías de esta localidad o amplía la búsqueda al municipio.";


    choices.append(
      localityButton(
        current.localidad
      )
    );

  }

  /* ==============================
     NO EXACTA
     ============================== */

  else {

    const localities =
      uniqueSorted(
        splitPipe(
          current.localidades_relacionadas
        )
      );


    /* ============================
       MULTILOCALIDAD
       ============================ */

    if (
      localities.length
    ) {

      section.classList.remove(
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
        localities.length === 1

          ? "Este reporte está relacionado con una localidad."

          : "Este reporte está relacionado con varias localidades. Elige una para explorar sus fotografías.";


      localities.forEach(
        locality => {

          choices.append(
            localityButton(
              locality
            )
          );

        }
      );

    }

    /* ============================
       MUNICIPIOS
       ============================ */

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

        section.classList.remove(
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
          "Elige un municipio para consultar sus fotografías.";


        municipalities.forEach(
          municipalityName => {

            const btn =
              localityButton(
                municipalityName
              );


            btn.onclick =
              () =>
                loadGallery(
                  {
                    municipio:
                      municipalityName
                  },
                  `Fotos de ${municipalityName}`
                );


            choices.append(
              btn
            );

          }
        );

      }

    }

  }


  /* ==============================
     BOTÓN MUNICIPIO
     ============================== */

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
   ZIP EN EL NAVEGADOR
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

      let c = n;


      for (
        let k = 0;
        k < 8;
        k++
      ) {

        c =
          (c & 1)

            ? (
                0xEDB88320 ^
                (c >>> 1)
              )

            : (
                c >>> 1
              );

      }


      table[n] =
        c >>> 0;

    }


    return table;

  })();


function crc32(bytes) {

  let crc =
    0 ^ -1;


  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {

    crc =
      (crc >>> 8) ^

      CRC_TABLE[
        (
          crc ^
          bytes[i]
        ) &
        0xFF
      ];

  }


  return (
    crc ^
    -1
  ) >>> 0;
}


function u16(value) {

  return new Uint8Array([
    value & 255,
    (value >>> 8) & 255
  ]);

}


function u32(value) {

  return new Uint8Array([
    value & 255,
    (value >>> 8) & 255,
    (value >>> 16) & 255,
    (value >>> 24) & 255
  ]);

}


function concatBytes(parts) {

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


function safeFilename(name) {

  return String(
    name ||
    "foto.jpg"
  )
    .replace(
      /[<>:"/\\|?*\x00-\x1F]+/g,
      "_"
    )
    .slice(
      0,
      150
    );
}


function makeStoredZip(files) {

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
      << 11
    )
    |
    (
      now.getMinutes()
      << 5
    )
    |
    Math.floor(
      now.getSeconds()
      / 2
    );


  const dosDate =
    (
      (
        year -
        1980
      )
      << 9
    )
    |
    (
      (
        now.getMonth()
        +
        1
      )
      << 5
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

        u16(20),

        u16(
          0x0800
        ),

        u16(0),

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

        u16(0),

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

        u16(20),

        u16(20),

        u16(
          0x0800
        ),

        u16(0),

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

        u16(0),

        u16(0),

        u16(0),

        u16(0),

        u32(0),

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

      u16(0),

      u16(0),

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

      u16(0)
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
   DESCARGAR SELECCIÓN
   ========================================================== */

async function downloadSelected() {

  const ids =
    [
      ...selectedPhotoIds
    ];


  if (
    !ids.length
  ) {
    return;
  }


  const selected =
    visibleGalleryPhotos
      .filter(
        photo =>
          selectedPhotoIds.has(
            photo.foto_id
          )
      );


  try {

    setStatus(
      `Preparando ${selected.length} fotografía${
        selected.length === 1
          ? ""
          : "s"
      }…`
    );


    const files =
      [];


    for (
      let i = 0;
      i < selected.length;
      i++
    ) {

      const photo =
        selected[i];


      setStatus(
        `Preparando ${
          i + 1
        } de ${
          selected.length
        }…`
      );


      const response =
        await fetch(
          imageUrl(photo)
        );


      if (
        !response.ok
      ) {
        continue;
      }


      const bytes =
        new Uint8Array(
          await response
            .arrayBuffer()
        );


      const contentType =
        response.headers
          .get(
            "content-type"
          ) || "";


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
          photo.nombre_archivo ||
          photo.foto_id
        )
          .replace(
            /\.[^.]+$/,
            ""
          );


      files.push({
        name:
          safeFilename(
            base
          )
          +
          extension,

        data:
          bytes
      });

    }


    if (
      !files.length
    ) {

      throw new Error(
        "No se pudieron preparar las fotografías."
      );

    }


    const zip =
      makeStoredZip(
        files
      );


    const url =
      URL.createObjectURL(
        zip
      );


    const a =
      document.createElement(
        "a"
      );


    a.href =
      url;


    a.download =
      "fotos_tpbv_seleccionadas.zip";


    document.body.appendChild(
      a
    );


    a.click();


    a.remove();


    setTimeout(
      () =>
        URL.revokeObjectURL(
          url
        ),
      30000
    );


    setStatus(
      "Descarga preparada."
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
   INICIO
   ========================================================== */

async function init() {

  const fotoId =
    photoIdFromPath();


  console.log(
    "TPBV foto_id:",
    fotoId
  );


  if (
    !fotoId
  ) {

    if (
      $("detailPlace")
    ) {

      $("detailPlace")
        .textContent =
        "Fotografía no especificada";

    }


    if (
      $("detailIntro")
    ) {

      $("detailIntro")
        .textContent =
        "El enlace no contiene el identificador de una fotografía.";

    }


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


    if (
      $("detailPlace")
    ) {

      $("detailPlace")
        .textContent =
        "Fotografía no encontrada";

    }


    if (
      $("detailIntro")
    ) {

      $("detailIntro")
        .textContent =
        error.message;

    }


    $("selectedSkeleton")
      ?.classList
      .add(
        "hidden"
      );


    return;
  }


  /* ==============================
     FOTO
     ============================== */

  setMainImage(
    current
  );


  /* ==============================
     DATOS
     ============================== */

  const municipality =
    municipalityOf(
      current
    );


  const role =
    roleLabel(
      current
    );


  const person =
    current.usuario_origen ||
    "";


  const related =
    uniqueSorted(
      splitPipe(
        current.localidades_relacionadas
      )
    );


  if (
    $("detailPlace")
  ) {

    $("detailPlace")
      .textContent =
      primaryPlace(
        current
      );

  }


  if (
    $("detailRole")
  ) {

    $("detailRole")
      .textContent =
      role;

  }


  if (
    $("selectedContext")
  ) {

    $("selectedContext")
      .textContent =
      municipality ||
      "TPBV";

  }


  if (
    $("downloadCurrentBtn")
  ) {

    $("downloadCurrentBtn")
      .href =
      downloadUrl(
        current
      );

  }


  /* ==============================
     DESCRIPCIÓN
     ============================== */

  if (
    current.tipo_asociacion ===
      "EXACTA"
  ) {

    $("detailIntro")
      .textContent =
      person

        ? `${role}: ${person}`

        : "Fotografía de Territorios de Paz y Buen Vivir.";

  }

  else {

    const relation =
      related.length

        ? `Reporte relacionado con ${related.length} localidad${
            related.length === 1
              ? ""
              : "es"
          }.`

        : "Fotografía relacionada con este territorio.";


    $("detailIntro")
      .textContent =
      person

        ? `${relation} ${role}: ${person}.`

        : relation;

  }


  /* ==============================
     RELACIONES
     ============================== */

  renderRelated();


  /* ==============================
     BUSCADOR
     ============================== */

  $("gallerySearch")
    ?.addEventListener(
      "input",
      applyGallerySearch
    );


  /* ==============================
     SELECCIONAR
     ============================== */

  if (
    $("selectAllBtn")
  ) {

    $("selectAllBtn")
      .onclick =
      () => {

        selectedPhotoIds.clear();


        filteredGalleryPhotos
          .slice(
            0,
            10
          )
          .forEach(
            photo => {

              selectedPhotoIds.add(
                photo.foto_id
              );

            }
          );


        if (
          filteredGalleryPhotos.length >
          10
        ) {

          setStatus(
            "Se seleccionaron las primeras 10 fotografías."
          );

        }


        updateSelectionUI();

      };

  }


  /* ==============================
     LIMPIAR
     ============================== */

  if (
    $("clearSelectionBtn")
  ) {

    $("clearSelectionBtn")
      .onclick =
      () => {

        selectedPhotoIds.clear();

        updateSelectionUI();

      };

  }


  /* ==============================
     DESCARGAR ZIP
     ============================== */

  if (
    $("downloadSelectedBtn")
  ) {

    $("downloadSelectedBtn")
      .onclick =
      downloadSelected;

  }

}


/* ==========================================================
   EJECUTAR
   ========================================================== */

init();