const state = {
  index: 0,
  total: 0,
  current: null,
  paused: false,
  animating: false,
  startedAt: 0,
  elapsedBeforePause: 0,
  raf: null,
  feedbackTimer: null,
  requestToken: 0
};


const $ =
  id =>
    document.getElementById(id);


const carouselVisual =
  document.querySelector(
    ".carousel-visual"
  );


const els = {

  leftPhoto:
    $("leftPhoto"),

  mainPhoto:
    $("mainPhoto"),

  rightPhoto:
    $("rightPhoto"),

  centerPhoto:
    $("centerPhoto"),

  municipio:
    $("municipio"),

  usuarioOrigen:
    $("usuarioOrigen"),

  qrImage:
    $("qrImage"),

  photoId:
    $("photoId"),

  progressBar:
    $("progressBar"),

  pauseFeedback:
    $("pauseFeedback"),

  pauseIcon:
    $("pauseIcon"),

  pauseText:
    $("pauseText"),

  imageError:
    $("imageError")
};


/* ==========================================================
   URL DE LA IMAGEN
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
   URL DEL QR
   ========================================================== */

function qrUrl(
  photo
) {

  return (

    `/api/qr?foto_id=` +

    encodeURIComponent(
      photo.foto_id
    )
  );
}


/* ==========================================================
   DURACIÓN DE LA FOTO
   ========================================================== */

function durationMs() {

  return Math.max(

    1,

    Number(
      state.current
        ?.duracion_carrusel_segundos

      ||

      10
    )

  ) * 1000;
}


/* ==========================================================
   PROMOTOR / COORDINADOR
   ========================================================== */

function nombreResponsable(
  photo
) {

  const nombre =
    photo?.usuario_origen
    ||
    "";


  if (!nombre) {

    return "";
  }


  const tipo =
    String(
      photo?.tipo_reporte
      ||
      ""
    )
      .toLowerCase();


  return (

    tipo ===
      "coordinador"

      ?

      `Coordinador: ${nombre}`

      :

      `Promotor: ${nombre}`
  );
}


/* ==========================================================
   MUNICIPIO
   ========================================================== */

function municipioVisible(
  photo
) {

  const municipio =
    String(
      photo?.municipio
      ||
      ""
    )
      .trim();


  if (municipio) {

    return municipio;
  }


  const relacionados =
    String(
      photo?.municipios_relacionados
      ||
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


  if (
    relacionados.length ===
    1
  ) {

    return relacionados[0];
  }


  if (
    relacionados.length >
    1
  ) {

    return "Varios municipios";
  }


  return "Municipio no especificado";
}


/* ==========================================================
   ÍNDICE ALEATORIO
   ========================================================== */

/*
 * NUEVO:
 *
 * Cada vez que recargas el carrusel,
 * se elige una fotografía inicial diferente.
 *
 * Después continúa:
 *
 * 1834
 * 1835
 * 1836
 * 1837
 * ...
 */

function randomIndex(
  total
) {

  if (
    !total ||
    total <= 1
  ) {

    return 0;
  }


  /*
   * Si el navegador tiene Crypto,
   * utilizamos un número aleatorio mejor.
   */

  if (
    window.crypto &&
    window.crypto.getRandomValues
  ) {

    const values =
      new Uint32Array(
        1
      );


    window.crypto
      .getRandomValues(
        values
      );


    return (
      values[0] %
      total
    );
  }


  /*
   * Fallback para navegadores antiguos.
   */

  return Math.floor(

    Math.random() *
    total
  );
}


/* ==========================================================
   MENSAJE PAUSA
   ========================================================== */

function showFeedback(
  paused
) {

  clearTimeout(
    state.feedbackTimer
  );


  els.pauseIcon.textContent =

    paused

      ?

      "❚❚"

      :

      "▶";


  els.pauseText.textContent =

    paused

      ?

      "Pausado"

      :

      "Continuando";


  els.pauseFeedback
    .classList
    .add(
      "show"
    );


  state.feedbackTimer =
    setTimeout(

      () => {

        els.pauseFeedback
          .classList
          .remove(
            "show"
          );

      },

      750
    );
}


/* ==========================================================
   CONSULTAR VENTANA DEL CARRUSEL
   ========================================================== */

async function fetchWindow(
  index
) {

  const response =
    await fetch(

      `/api/data?action=carrusel-window&index=${encodeURIComponent(index)}`,

      {
        cache:
          "no-store"
      }
    );


  if (
    !response.ok
  ) {

    throw new Error(

      `HTTP ${response.status}`
    );
  }


  return response.json();
}


/* ==========================================================
   PRECARGAR FOTO
   ========================================================== */

function preloadPhoto(
  photo
) {

  if (
    !photo?.foto_id
  ) {

    return;
  }


  const image =
    new Image();


  image.src =
    imageUrl(
      photo
    );
}


/* ==========================================================
   MOSTRAR FOTOS
   ========================================================== */

function renderWindow(
  data
) {

  if (
    !data?.current
  ) {

    throw new Error(

      "No hay fotografías para el carrusel."
    );
  }


  state.index =
    data.index;


  state.total =
    data.total;


  state.current =
    data.current;


  const prev =
    data.prev;


  const current =
    data.current;


  const next =
    data.next;


  /* ========================================================
     LATERALES
     ======================================================== */

  els.leftPhoto.src =
    imageUrl(
      prev
    );


  els.rightPhoto.src =
    imageUrl(
      next
    );


  /* ========================================================
     FOTO CENTRAL
     ======================================================== */

  const currentUrl =
    imageUrl(
      current
    );


  els.centerPhoto
    .style
    .setProperty(

      "--current-photo",

      `url("${currentUrl}")`
    );


  els.mainPhoto.style.display =
    "block";


  els.imageError
    .classList
    .add(
      "hidden"
    );


  els.mainPhoto.onerror =
    () => {

      els.mainPhoto.style.display =
        "none";


      els.imageError
        .classList
        .remove(
          "hidden"
        );
    };


  els.mainPhoto.onload =
    () => {

      els.mainPhoto.style.display =
        "block";


      els.imageError
        .classList
        .add(
          "hidden"
        );
    };


  els.mainPhoto.src =
    currentUrl;


  /* ========================================================
     INFORMACIÓN
     ======================================================== */

  els.municipio.textContent =
    municipioVisible(
      current
    );


  els.usuarioOrigen.textContent =
    nombreResponsable(
      current
    );


  if (
    els.photoId
  ) {

    els.photoId.textContent =
      current.foto_id
      ||
      "";
  }


  /* ========================================================
     QR
     ======================================================== */

  els.qrImage.src =

    `${qrUrl(current)}&v=${Date.now()}`;


  /* ========================================================
     PRECARGAR SIGUIENTES
     ======================================================== */

  preloadPhoto(
    prev
  );


  preloadPhoto(
    next
  );
}


/* ==========================================================
   REINICIAR TEMPORIZADOR
   ========================================================== */

function resetTimer() {

  state.startedAt =
    performance.now();


  state.elapsedBeforePause =
    0;


  els.progressBar.style.width =
    "0%";
}


/* ==========================================================
   ESPERA
   ========================================================== */

function sleep(
  ms
) {

  return new Promise(

    resolve =>

      setTimeout(
        resolve,
        ms
      )
  );
}


/* ==========================================================
   NAVEGAR
   ========================================================== */

async function navigateTo(

  targetIndex,

  direction

) {

  if (
    state.animating
  ) {

    return;
  }


  state.animating =
    true;


  const token =
    ++state.requestToken;


  try {

    const data =
      await fetchWindow(
        targetIndex
      );


    if (
      token !==
      state.requestToken
    ) {

      return;
    }


    const className =

      direction ===
        "prev"

        ?

        "stitch-moving-prev"

        :

        "stitch-moving-next";


    carouselVisual
      .classList
      .add(
        className
      );


    /*
     * Stitch:
     * transición total 0.8 segundos.
     */

    await sleep(
      690
    );


    carouselVisual
      .classList
      .add(
        "stitch-no-transition"
      );


    renderWindow(
      data
    );


    carouselVisual
      .classList
      .remove(

        "stitch-moving-prev",

        "stitch-moving-next"
      );


    void carouselVisual.offsetWidth;


    carouselVisual
      .classList
      .remove(
        "stitch-no-transition"
      );


    resetTimer();


  } catch (error) {

    console.error(
      error
    );


    els.municipio.textContent =

      "No se pudo cargar la fotografía";


    els.usuarioOrigen.textContent =

      "La conexión tuvo un corte temporal.";


  } finally {

    state.animating =
      false;
  }
}


/* ==========================================================
   PAUSAR
   ========================================================== */

function togglePause() {

  if (

    !state.current

    ||

    state.animating

  ) {

    return;
  }


  if (
    !state.paused
  ) {

    state.elapsedBeforePause +=

      performance.now()

      -

      state.startedAt;


    state.paused =
      true;

  }

  else {

    state.paused =
      false;


    state.startedAt =
      performance.now();
  }


  showFeedback(
    state.paused
  );


  els.centerPhoto
    .classList
    .toggle(

      "is-paused",

      state.paused
    );
}


/* ==========================================================
   BARRA DE PROGRESO
   ========================================================== */

function tick(
  now
) {

  if (

    !state.paused

    &&

    !state.animating

    &&

    state.current

  ) {

    const duration =
      durationMs();


    const elapsed =

      state.elapsedBeforePause

      +

      (
        now -
        state.startedAt
      );


    const ratio =
      Math.min(

        1,

        elapsed /
        duration
      );


    els.progressBar.style.width =

      `${ratio * 100}%`;


    if (
      elapsed >=
      duration
    ) {

      navigateTo(

        state.index +
        1,

        "next"
      );
    }
  }


  state.raf =
    requestAnimationFrame(
      tick
    );
}


/* ==========================================================
   BOTONES
   ========================================================== */

$("prevBtn")
  .addEventListener(

    "click",

    () =>

      navigateTo(

        state.index -
        1,

        "prev"
      )
  );


$("nextBtn")
  .addEventListener(

    "click",

    () =>

      navigateTo(

        state.index +
        1,

        "next"
      )
  );


$("leftPhotoBtn")
  .addEventListener(

    "click",

    () =>

      navigateTo(

        state.index -
        1,

        "prev"
      )
  );


$("rightPhotoBtn")
  .addEventListener(

    "click",

    () =>

      navigateTo(

        state.index +
        1,

        "next"
      )
  );


els.centerPhoto
  .addEventListener(

    "click",

    togglePause
  );


els.centerPhoto
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

        event.preventDefault();


        togglePause();
      }
    }
  );


/* ==========================================================
   TECLADO
   ========================================================== */

document
  .addEventListener(

    "keydown",

    event => {

      if (
        event.key ===
        "ArrowLeft"
      ) {

        navigateTo(

          state.index -
          1,

          "prev"
        );
      }


      if (
        event.key ===
        "ArrowRight"
      ) {

        navigateTo(

          state.index +
          1,

          "next"
        );
      }
    }
  );


/* ==========================================================
   INICIAR CARRUSEL
   ========================================================== */

(async function init() {

  try {

    /*
     * Primero pedimos una ventana únicamente
     * para conocer cuántas fotografías existen.
     */

    const firstData =
      await fetchWindow(
        0
      );


    if (
      !firstData.total
    ) {

      throw new Error(

        "El carrusel no contiene fotografías."
      );
    }


    /*
     * NUEVO:
     *
     * elegimos una posición inicial aleatoria.
     */

    const initialIndex =
      randomIndex(
        firstData.total
      );


    /*
     * Si casualmente salió 0,
     * reutilizamos la consulta anterior.
     */

    const data =

      initialIndex ===
      0

        ?

        firstData

        :

        await fetchWindow(
          initialIndex
        );


    renderWindow(
      data
    );


    resetTimer();


    requestAnimationFrame(
      tick
    );


  } catch (error) {

    console.error(
      error
    );


    els.municipio.textContent =

      "No se pudo iniciar el carrusel";


    els.usuarioOrigen.textContent =

      "Revisa el catálogo y las variables de Google Drive.";
  }
})();