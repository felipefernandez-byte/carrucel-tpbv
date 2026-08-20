const $ = id =>
    document.getElementById(id);


/* ==========================================================
   ESTADO GENERAL
   ========================================================== */

let current = null;


/*
 * Todas las fotografías pertenecientes
 * a la localidad o municipio seleccionado.
 */
let visibleGalleryPhotos = [];


/*
 * Fotografías después de aplicar el buscador.
 */
let filteredGalleryPhotos = [];


/*
 * Localidad o municipio que se está explorando.
 */
let activeGalleryParams = null;


/*
 * Título de la galería actual.
 */
let activeGalleryTitle = "";


/*
 * Cantidad de tarjetas que pintamos inicialmente.
 *
 * No significa que solo existan 120.
 * Las demás ya están disponibles internamente.
 */
let renderLimit = 120;


/*
 * IDs de las fotografías seleccionadas.
 *
 * Ya NO existe límite de 10.
 */
const selectedPhotoIds =
    new Set();


/* ==========================================================
   UTILIDADES
   ========================================================== */

function splitPipe(value) {

    return String(
        value || ""
    )
        .split("|")
        .map(
            value =>
                value.trim()
        )
        .filter(Boolean);
}


/* ==========================================================
   OBTENER FOTO_ID DEL QR
   ========================================================== */

function photoIdFromPath() {

    /*
     * FORMA ACTUAL:
     *
     * /detalle.html?foto=FOTO-XXXXX
     */

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


    /*
     * COMPATIBILIDAD CON LA RUTA ANTERIOR:
     *
     * /foto/FOTO-XXXXX
     */

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


    return null;
}


/* ==========================================================
   URL PARA MOSTRAR IMAGEN
   ========================================================== */

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


/* ==========================================================
   URL PARA DESCARGAR IMAGEN
   ========================================================== */

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


/* ==========================================================
   FETCH JSON
   ========================================================== */

async function fetchJson(url) {

    const response =
        await fetch(
            url,
            {
                cache:
                    "no-store"
            }
        );


    if (!response.ok) {

        const body =
            await response
                .json()
                .catch(
                    () => ({})
                );


        throw new Error(
            body.error ||
            `HTTP ${response.status}`
        );
    }


    return response.json();
}


/* ==========================================================
   PROMOTOR / COORDINADOR
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


/* ==========================================================
   OBTENER MUNICIPIO
   ========================================================== */

function municipalityOf(photo) {

    if (!photo) {

        return "";
    }


    const propio =
        String(
            photo.municipio || ""
        )
            .trim();


    if (propio) {

        return propio;
    }


    const relacionados =
        splitPipe(
            photo.municipios_relacionados
        );


    if (
        relacionados.length === 1
    ) {

        return relacionados[0];
    }


    return "";
}


/* ==========================================================
   LUGAR PRINCIPAL
   ========================================================== */

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


/* ==========================================================
   QUITAR REPETIDOS Y ORDENAR
   ========================================================== */

function uniqueSorted(values) {

    return [
        ...new Set(
            values
                .map(
                    value =>
                        String(
                            value || ""
                        )
                            .trim()
                )
                .filter(Boolean)
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


    element.classList.remove(
        "hidden"
    );


    clearTimeout(
        setStatus.timer
    );


    /*
     * Para descargas grandes dejamos
     * el mensaje visible hasta actualizarlo.
     */
    if (!persistent) {

        setStatus.timer =
            setTimeout(
                () => {

                    element.classList.add(
                        "hidden"
                    );

                },
                4500
            );
    }
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
                "No fue posible cargar la fotografía."
            );
        };


    img.src =
        imageUrl(photo);
}


/* ==========================================================
   TRAER TODAS LAS FOTOS
   DE UNA LOCALIDAD O MUNICIPIO
   ========================================================== */

async function fetchAllGalleryPhotos(
    params
) {

    const result = [];


    let offset = 0;


    /*
     * El API entrega hasta 500 registros
     * de catálogo por petición.
     *
     * Seguimos solicitando páginas
     * hasta tener todas las fotografías.
     */
    while (true) {

        const query =
            new URLSearchParams({
                action:
                    "fotos",

                limit:
                    "500",

                offset:
                    String(offset),

                ...params
            });


        const data =
            await fetchJson(
                `/api/data?${query.toString()}`
            );


        const items =
            data.items || [];


        result.push(
            ...items
        );


        /*
         * Ya llegamos al final.
         */
        if (
            data.nextOffset === null ||
            data.nextOffset === undefined ||
            items.length === 0
        ) {

            break;
        }


        offset =
            data.nextOffset;
    }


    return result;
}


/* ==========================================================
   NOMBRE QUE SE MUESTRA EN TARJETA
   ========================================================== */

function cardPlace(photo) {

    if (
        photo.localidad
    ) {

        return photo.localidad;
    }


    const localidades =
        splitPipe(
            photo.localidades_relacionadas
        );


    if (
        localidades.length === 1
    ) {

        return localidades[0];
    }


    return (
        municipalityOf(photo) ||
        "TPBV"
    );
}


/* ==========================================================
   SELECCIONAR / DESELECCIONAR
   ========================================================== */

function togglePhotoSelection(photo) {

    if (
        selectedPhotoIds.has(
            photo.foto_id
        )
    ) {

        selectedPhotoIds.delete(
            photo.foto_id
        );

    } else {

        selectedPhotoIds.add(
            photo.foto_id
        );
    }


    updateSelectionUI();
}


/* ==========================================================
   ACTUALIZAR UI DE SELECCIÓN
   ========================================================== */

function updateSelectionUI() {

    const count =
        selectedPhotoIds.size;


    /* ======================================================
       CONTADOR
       ====================================================== */

    const selectedCount =
        $("selectedCount");


    if (selectedCount) {

        selectedCount.textContent =
            `${count} seleccionada${
                count === 1
                    ? ""
                    : "s"
            }`;
    }


    /* ======================================================
       BARRA INFERIOR
       ====================================================== */

    const dock =
        $("selectionDock");


    if (dock) {

        dock.classList.toggle(
            "hidden",
            count === 0
        );
    }


    /* ======================================================
       BOTÓN SUPERIOR
       ====================================================== */

    const topButton =
        $("downloadSelectedTopBtn");


    if (topButton) {

        topButton.disabled =
            count === 0;
    }


    /* ======================================================
       ESTADO VISUAL DE TARJETAS
       ====================================================== */

    document
        .querySelectorAll(
            ".gallery-card"
        )
        .forEach(
            card => {

                const selected =
                    selectedPhotoIds.has(
                        card.dataset.photoId
                    );


                card.classList.toggle(
                    "selected",
                    selected
                );


                card.setAttribute(
                    "aria-pressed",
                    selected
                        ? "true"
                        : "false"
                );
            }
        );
}


/* ==========================================================
   CREAR TARJETA DE GALERÍA
   ========================================================== */

function createGalleryCard(photo) {

    const card =
        document.createElement(
            "article"
        );


    card.className =
        "gallery-card";


    card.dataset.photoId =
        photo.foto_id;


    card.tabIndex = 0;


    card.setAttribute(
        "role",
        "button"
    );


    card.setAttribute(
        "aria-label",
        `Seleccionar fotografía de ${cardPlace(photo)}`
    );


    card.setAttribute(
        "aria-pressed",
        selectedPhotoIds.has(
            photo.foto_id
        )
            ? "true"
            : "false"
    );


    /* ======================================================
       INDICADOR DE SELECCIÓN
       ====================================================== */

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


    const check =
        document.createElement(
            "span"
        );


    check.textContent =
        "✓";


    selector.append(
        check
    );


    /* ======================================================
       IMAGEN
       ====================================================== */

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


    /* ======================================================
       PIE DE TARJETA
       ====================================================== */

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


    /* ======================================================
       BOTÓN DESCARGAR INDIVIDUAL
       SOLO ICONO
       ====================================================== */

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


    download.setAttribute(
        "aria-label",
        "Descargar fotografía"
    );


    /*
     * IMPORTANTE:
     *
     * Ya no mostramos la palabra:
     *
     * Descargar
     *
     * Solo aparece el ícono.
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
     * Si se toca el botón de descargar
     * NO se selecciona/desselecciona la tarjeta.
     */
    download.addEventListener(
        "click",
        event => {

            event.stopPropagation();
        }
    );


    body.append(
        title,
        download
    );


    card.append(
        selector,
        img,
        body
    );


    /* ======================================================
       TODA LA TARJETA SELECCIONA
       ====================================================== */

    card.addEventListener(
        "click",
        event => {

            /*
             * No actuar si se tocó
             * el botón de descarga.
             */
            if (
                event.target.closest(
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


    /* ======================================================
       ACCESIBILIDAD CON TECLADO
       ====================================================== */

    card.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" ||
                event.key === " "
            ) {

                event.preventDefault();


                togglePhotoSelection(
                    photo
                );
            }
        }
    );


    /*
     * Si ya estaba seleccionada,
     * conservar estado al volver a renderizar.
     */
    if (
        selectedPhotoIds.has(
            photo.foto_id
        )
    ) {

        card.classList.add(
            "selected"
        );
    }


    return card;
}


/* ==========================================================
   PINTAR GALERÍA
   ========================================================== */

function renderGallery() {

    const gallery =
        $("gallery");


    if (!gallery) {

        return;
    }


    gallery.innerHTML =
        "";


    /* ======================================================
       SIN RESULTADOS
       ====================================================== */

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


    /* ======================================================
       CREAR TARJETAS
       ====================================================== */

    const fragment =
        document.createDocumentFragment();


    /*
     * Solo pintamos inicialmente 120.
     *
     * Esto evita poner 1000 imágenes
     * simultáneamente en memoria/render.
     */
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


    /* ======================================================
       BOTÓN CARGAR MÁS
       ====================================================== */

    const loadMore =
        $("loadMoreBtn");


    const pendientes =
        filteredGalleryPhotos.length -
        renderLimit;


    if (loadMore) {

        loadMore.classList.toggle(
            "hidden",
            pendientes <= 0
        );


        if (
            pendientes > 0
        ) {

            loadMore.textContent =
                `Cargar más (${pendientes} restantes)`;
        }
    }


    updateSelectionUI();
}


/* ==========================================================
   BUSCADOR
   ========================================================== */

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

            ?

            visibleGalleryPhotos

            :

            visibleGalleryPhotos.filter(
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


    /*
     * Si cambia la búsqueda,
     * volvemos a pintar hasta 120.
     */
    renderLimit =
        120;


    renderGallery();
}


/* ==========================================================
   CARGAR GALERÍA DE LOCALIDAD / MUNICIPIO
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


    selectedPhotoIds.clear();


    $("gallerySection")
        ?.classList
        .remove(
            "hidden"
        );


    if (
        $("galleryTitle")
    ) {

        $("galleryTitle").textContent =
            "Cargando fotografías…";
    }


    if (
        $("galleryCount")
    ) {

        $("galleryCount").textContent =
            "";
    }


    if (
        $("galleryScopeHelp")
    ) {

        $("galleryScopeHelp").textContent =
            "Cargando todas las fotografías disponibles…";
    }


    if (
        $("gallery")
    ) {

        $("gallery").innerHTML =
            "";
    }


    $("loadMoreBtn")
        ?.classList
        .add(
            "hidden"
        );


    updateSelectionUI();


    try {

        /* ==================================================
           TRAER TODAS
           ================================================== */

        const items =
            await fetchAllGalleryPhotos(
                params
            );


        visibleGalleryPhotos =
            items;


        filteredGalleryPhotos =
            items;


        /* ==================================================
           INFORMACIÓN
           ================================================== */

        $("galleryTitle").textContent =
            title;


        $("galleryCount").textContent =
            String(
                items.length
            );


        const scope =
            params.localidad ||
            params.municipio ||
            "este territorio";


        $("galleryScopeHelp").textContent =
            `${items.length} fotografía${
                items.length === 1
                    ? ""
                    : "s"
            } en ${scope}. Toca cualquier imagen para seleccionarla.`;


        /* ==================================================
           TEXTO BOTÓN DESCARGAR TODO
           ================================================== */

        if (
            $("downloadAllScopeText")
        ) {

            $("downloadAllScopeText").textContent =
                params.localidad

                    ?

                    "Descargar toda la localidad"

                    :

                    "Descargar todo el municipio";
        }


        if (
            $("gallerySearch")
        ) {

            $("gallerySearch").value =
                "";
        }


        renderGallery();


        /* ==================================================
           BAJAR AUTOMÁTICAMENTE A LA GALERÍA
           ================================================== */

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


    } catch (error) {

        console.error(
            error
        );


        if (
            $("galleryTitle")
        ) {

            $("galleryTitle").textContent =
                "No se pudieron cargar las fotografías";
        }


        if (
            $("galleryScopeHelp")
        ) {

            $("galleryScopeHelp").textContent =
                error.message;
        }


        setStatus(
            error.message
        );
    }
}


/* ==========================================================
   CREAR BOTÓN DE LOCALIDAD
   ========================================================== */

function localityButton(name) {

    const button =
        document.createElement(
            "button"
        );


    button.className =
        "locality-choice";


    button.type =
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


    button.append(
        icon,
        label,
        arrow
    );


    button.onclick =
        () => {

            loadGallery(
                {
                    localidad:
                        name
                },
                `Fotos de ${name}`
            );
        };


    return button;
}


/* ==========================================================
   LOCALIDADES / MUNICIPIOS RELACIONADOS
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


    municipalityBtn.classList.add(
        "hidden"
    );


    const municipality =
        municipalityOf(
            current
        );


    /* ======================================================
       EXACTA
       ====================================================== */

    if (
        current.tipo_asociacion ===
            "EXACTA" &&
        current.localidad
    ) {

        section.classList.remove(
            "hidden"
        );


        $("relatedTitle").textContent =
            "Explora esta localidad";


        $("relatedCount").textContent =
            "";


        $("relatedHelp").textContent =
            "Consulta, selecciona o descarga todas las fotografías de esta localidad.";


        choices.append(
            localityButton(
                current.localidad
            )
        );
    }


    /* ======================================================
       MULTILOCALIDAD / OTROS
       ====================================================== */

    else {

        const localities =
            uniqueSorted(
                splitPipe(
                    current.localidades_relacionadas
                )
            );


        /* ==================================================
           VARIAS LOCALIDADES
           ================================================== */

        if (
            localities.length
        ) {

            section.classList.remove(
                "hidden"
            );


            $("relatedTitle").textContent =
                "Localidades relacionadas";


            $("relatedCount").textContent =
                String(
                    localities.length
                );


            $("relatedHelp").textContent =
                localities.length === 1

                    ?

                    "Entra a la localidad para consultar o descargar todas sus fotografías."

                    :

                    "Elige una localidad para consultar, seleccionar o descargar sus fotografías.";


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


        /* ==================================================
           MUNICIPIOS RELACIONADOS
           ================================================== */

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


                $("relatedTitle").textContent =
                    "Municipios relacionados";


                $("relatedCount").textContent =
                    String(
                        municipalities.length
                    );


                $("relatedHelp").textContent =
                    "Elige un municipio para consultar o descargar sus fotografías.";


                municipalities.forEach(
                    municipalityName => {

                        const button =
                            localityButton(
                                municipalityName
                            );


                        /*
                         * Este botón debe buscar
                         * por municipio y no por localidad.
                         */
                        button.onclick =
                            () => {

                                loadGallery(
                                    {
                                        municipio:
                                            municipalityName
                                    },
                                    `Fotos de ${municipalityName}`
                                );
                            };


                        choices.append(
                            button
                        );
                    }
                );
            }
        }
    }


    /* ======================================================
       VER TODO EL MUNICIPIO
       ====================================================== */

    if (
        municipality
    ) {

        $("municipalityBtnText").textContent =
            municipality;


        municipalityBtn.classList.remove(
            "hidden"
        );


        municipalityBtn.onclick =
            () => {

                loadGallery(
                    {
                        municipio:
                            municipality
                    },
                    `Fotos de ${municipality}`
                );
            };
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

            let c = n;


            for (
                let k = 0;
                k < 8;
                k++
            ) {

                c =
                    (c & 1)

                        ?

                        (
                            0xEDB88320 ^
                            (c >>> 1)
                        )

                        :

                        (
                            c >>> 1
                        );
            }


            table[n] =
                c >>> 0;
        }


        return table;
    })();


/* ==========================================================
   CRC32
   ========================================================== */

function crc32(bytes) {

    let crc =
        -1;


    for (
        let i = 0;
        i < bytes.length;
        i++
    ) {

        crc =
            (crc >>> 8)

            ^

            CRC_TABLE[
                (
                    crc ^
                    bytes[i]
                )
                &
                0xFF
            ];
    }


    return (
        crc ^
        -1
    ) >>> 0;
}


/* ==========================================================
   UINT16
   ========================================================== */

function u16(value) {

    return new Uint8Array([
        value & 255,

        (
            value >>> 8
        )
        &
        255
    ]);
}


/* ==========================================================
   UINT32
   ========================================================== */

function u32(value) {

    return new Uint8Array([
        value & 255,

        (
            value >>> 8
        )
        &
        255,

        (
            value >>> 16
        )
        &
        255,

        (
            value >>> 24
        )
        &
        255
    ]);
}


/* ==========================================================
   CONCATENAR BYTES
   ========================================================== */

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


    let offset = 0;


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
   NOMBRE SEGURO
   ========================================================== */

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
            145
        );
}


/* ==========================================================
   EVITAR NOMBRES DUPLICADOS EN EL ZIP
   ========================================================== */

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
            `${base}_${number}${extension}`;


        number++;
    }


    used.add(
        candidate.toLowerCase()
    );


    return candidate;
}


/* ==========================================================
   CREAR ZIP SIN COMPRESIÓN EXTRA
   ========================================================== */

function makeStoredZip(files) {

    const encoder =
        new TextEncoder();


    const localParts = [];


    const centralParts = [];


    let offset = 0;


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


        /* ==================================================
           CABECERA LOCAL
           ================================================== */

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


        /* ==================================================
           DIRECTORIO CENTRAL
           ================================================== */

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


    /* ======================================================
       FINAL DEL ZIP
       ====================================================== */

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
   PREPARAR FOTO OPTIMIZADA PARA ZIP
   ========================================================== */

async function fetchPhotoForZip(photo) {

    /*
     * IMPORTANTE:
     *
     * Para el ZIP usamos /api/download
     * y NO /api/image.
     *
     * De esta forma recibimos la
     * versión optimizada configurada
     * en api/download.js.
     */

    try {

        /* ==================================================
           DESCARGAR IMAGEN OPTIMIZADA
           ================================================== */

        const response =
            await fetch(
                downloadUrl(photo),
                {
                    cache:
                        "no-store"
                }
            );


        /* ==================================================
           VALIDAR RESPUESTA
           ================================================== */

        if (!response.ok) {

            console.error(
                "No se pudo descargar la fotografía:",
                photo.foto_id,
                response.status
            );


            return null;
        }


        /* ==================================================
           CONVERTIR A BYTES
           ================================================== */

        const buffer =
            await response.arrayBuffer();


        const data =
            new Uint8Array(
                buffer
            );


        if (
            !data ||
            data.length === 0
        ) {

            console.error(
                "La fotografía llegó vacía:",
                photo.foto_id
            );


            return null;
        }


        /* ==================================================
           DETECTAR EXTENSIÓN
           ================================================== */

        const contentType =
            String(
                response.headers.get(
                    "content-type"
                )
                ||
                ""
            )
                .toLowerCase();


        let extension =
            ".jpg";


        if (
            contentType.includes(
                "image/png"
            )
        ) {

            extension =
                ".png";
        }


        else if (
            contentType.includes(
                "image/webp"
            )
        ) {

            extension =
                ".webp";
        }


        else if (
            contentType.includes(
                "image/gif"
            )
        ) {

            extension =
                ".gif";
        }


        else if (
            contentType.includes(
                "image/jpeg"
            )
            ||
            contentType.includes(
                "image/jpg"
            )
        ) {

            extension =
                ".jpg";
        }


        /* ==================================================
           NOMBRE
           ================================================== */

        const nombreOriginal =
            String(
                photo.nombre_archivo
                ||
                photo.foto_id
                ||
                "foto"
            );


        /*
         * Quitamos la extensión actual.
         */
        const base =
            nombreOriginal.replace(
                /\.[^.]+$/,
                ""
            );


        /*
         * Ejemplo:
         *
         * FOTO-000123_optimizada.jpg
         */
        const proposedName =
            `${base}_optimizada${extension}`;


        /* ==================================================
           RESPUESTA
           ================================================== */

        return {
            proposedName:
                proposedName,

            data:
                data
        };


    } catch (error) {

        console.error(
            "Error preparando fotografía para ZIP:",
            photo?.foto_id,
            error
        );


        /*
         * Una fotografía que falle
         * no cancela todo el ZIP.
         */
        return null;
    }
}


/* ==========================================================
   DESCARGAR VARIAS FOTOS COMO ZIP
   ========================================================== */

async function downloadPhotosAsZip(
    photos,
    filename
) {

    if (
        !photos ||
        photos.length === 0
    ) {

        setStatus(
            "No hay fotografías para descargar."
        );


        return;
    }


    /* ======================================================
       INICIO
       ====================================================== */

    setStatus(
        `Preparando ${photos.length} fotografía${
            photos.length === 1
                ? ""
                : "s"
        }. No cierres esta página…`,
        true
    );


    const files = [];


    const usedNames =
        new Set();


    /*
     * Índice compartido por los workers.
     */
    let nextIndex = 0;


    let completed = 0;


    /*
     * Cuatro peticiones simultáneas.
     *
     * Ayuda a acelerar sin saturar tanto
     * un teléfono celular.
     */
    const concurrency = 4;


    /* ======================================================
       WORKER
       ====================================================== */

    async function worker() {

        while (true) {

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


                if (result) {

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
                    "Error preparando fotografía:",
                    photo.foto_id,
                    error
                );
            }


            completed++;


            /*
             * Actualizar progreso cada 5 fotos.
             */
            if (
                completed === photos.length ||
                completed % 5 === 0
            ) {

                setStatus(
                    `Preparando ${completed} de ${photos.length}…`,
                    true
                );
            }
        }
    }


    /* ======================================================
       EJECUTAR WORKERS
       ====================================================== */

    await Promise.all(
        Array.from(
            {
                length:
                    Math.min(
                        concurrency,
                        photos.length
                    )
            },
            () => worker()
        )
    );


    /* ======================================================
       VALIDAR
       ====================================================== */

    if (
        files.length === 0
    ) {

        throw new Error(
            "No fue posible preparar ninguna fotografía."
        );
    }


    /* ======================================================
       CREAR ZIP
       ====================================================== */

    setStatus(
        `Creando ZIP con ${files.length} fotografía${
            files.length === 1
                ? ""
                : "s"
        }…`,
        true
    );


    const zip =
        makeStoredZip(
            files
        );


    /* ======================================================
       DESCARGAR ZIP
       ====================================================== */

    const url =
        URL.createObjectURL(
            zip
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


    /*
     * Liberar URL temporal.
     */
    setTimeout(
        () => {

            URL.revokeObjectURL(
                url
            );

        },
        30000
    );


    /* ======================================================
       TERMINADO
       ====================================================== */

    if (
        files.length ===
        photos.length
    ) {

        setStatus(
            `ZIP preparado: ${files.length} fotografía${
                files.length === 1
                    ? ""
                    : "s"
            }.`
        );

    } else {

        setStatus(
            `ZIP preparado con ${files.length} de ${photos.length} fotografías.`
        );
    }
}


/* ==========================================================
   OBTENER FOTOS SELECCIONADAS
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
        items.length === 0
    ) {

        setStatus(
            "Primero selecciona una o más fotografías."
        );


        return;
    }


    /*
     * Crear un nombre amigable
     * para el ZIP.
     */
    const safeTitle =
        (
            activeGalleryTitle ||
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
   DESCARGAR TODA LA LOCALIDAD / MUNICIPIO
   ========================================================== */

async function downloadAllCurrentScope() {

    if (
        visibleGalleryPhotos.length === 0
    ) {

        setStatus(
            "No hay fotografías para descargar."
        );


        return;
    }


    const scope =
        activeGalleryParams?.localidad
        ||
        activeGalleryParams?.municipio
        ||
        "territorio";


    const safeScope =
        String(scope)
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
   INICIAR PÁGINA
   ========================================================== */

async function init() {

    const fotoId =
        photoIdFromPath();


    console.log(
        "TPBV foto_id:",
        fotoId
    );


    /* ======================================================
       SIN FOTO
       ====================================================== */

    if (!fotoId) {

        if (
            $("detailPlace")
        ) {

            $("detailPlace").textContent =
                "Fotografía no especificada";
        }


        if (
            $("detailIntro")
        ) {

            $("detailIntro").textContent =
                "El enlace no contiene el identificador de una fotografía.";
        }


        $("selectedSkeleton")
            ?.classList
            .add(
                "hidden"
            );


        return;
    }


    /* ======================================================
       CONSULTAR FOTO
       ====================================================== */

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

            $("detailPlace").textContent =
                "Fotografía no encontrada";
        }


        if (
            $("detailIntro")
        ) {

            $("detailIntro").textContent =
                error.message;
        }


        $("selectedSkeleton")
            ?.classList
            .add(
                "hidden"
            );


        return;
    }


    /* ======================================================
       MOSTRAR FOTO
       ====================================================== */

    setMainImage(
        current
    );


    /* ======================================================
       INFORMACIÓN
       ====================================================== */

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

        $("detailPlace").textContent =
            primaryPlace(
                current
            );
    }


    if (
        $("detailRole")
    ) {

        $("detailRole").textContent =
            role;
    }


    if (
        $("selectedContext")
    ) {

        $("selectedContext").textContent =
            municipality ||
            "TPBV";
    }


    /* ======================================================
       DESCARGAR FOTO PRINCIPAL
       ====================================================== */

    if (
        $("downloadCurrentBtn")
    ) {

        $("downloadCurrentBtn").href =
            downloadUrl(
                current
            );
    }


    /* ======================================================
       DESCRIPCIÓN
       ====================================================== */

    if (
        current.tipo_asociacion ===
        "EXACTA"
    ) {

        $("detailIntro").textContent =
            person

                ?

                `${role}: ${person}`

                :

                "Fotografía de Territorios de Paz y Buen Vivir.";

    } else {

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


        $("detailIntro").textContent =
            person

                ?

                `${relation} ${role}: ${person}.`

                :

                relation;
    }


    /* ======================================================
       LOCALIDADES / MUNICIPIOS
       ====================================================== */

    renderRelated();


    /* ======================================================
       BUSCADOR
       ====================================================== */

    $("gallerySearch")
        ?.addEventListener(
            "input",
            applyGallerySearch
        );


    /* ======================================================
       CARGAR MÁS
       ====================================================== */

    $("loadMoreBtn")
        ?.addEventListener(
            "click",
            () => {

                renderLimit +=
                    120;


                renderGallery();
            }
        );


    /* ======================================================
       SELECCIONAR TODAS
       ====================================================== */

    if (
        $("selectAllBtn")
    ) {

        $("selectAllBtn").onclick =
            () => {

                /*
                 * Seleccionamos TODAS las fotografías
                 * del resultado filtrado.
                 *
                 * Sin límite de 10.
                 */
                filteredGalleryPhotos
                    .forEach(
                        photo => {

                            selectedPhotoIds.add(
                                photo.foto_id
                            );
                        }
                    );


                updateSelectionUI();


                renderGallery();
            };
    }


    /* ======================================================
       LIMPIAR SELECCIÓN
       ====================================================== */

    if (
        $("clearSelectionBtn")
    ) {

        $("clearSelectionBtn").onclick =
            () => {

                selectedPhotoIds.clear();


                updateSelectionUI();


                renderGallery();
            };
    }


    /* ======================================================
       DESCARGAR SELECCIONADAS ABAJO
       ====================================================== */

    if (
        $("downloadSelectedBtn")
    ) {

        $("downloadSelectedBtn").onclick =
            downloadSelected;
    }


    /* ======================================================
       DESCARGAR SELECCIONADAS ARRIBA
       ====================================================== */

    if (
        $("downloadSelectedTopBtn")
    ) {

        $("downloadSelectedTopBtn").onclick =
            downloadSelected;
    }


    /* ======================================================
       DESCARGAR TODA LOCALIDAD / MUNICIPIO
       ====================================================== */

    if (
        $("downloadAllScopeBtn")
    ) {

        $("downloadAllScopeBtn").onclick =
            downloadAllCurrentScope;
    }
}


/* ==========================================================
   EJECUTAR
   ========================================================== */

init();