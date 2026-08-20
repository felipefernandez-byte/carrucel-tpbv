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

const $ = id => document.getElementById(id);
const carouselVisual = document.querySelector(".carousel-visual");

const els = {
  leftPhoto: $("leftPhoto"),
  mainPhoto: $("mainPhoto"),
  rightPhoto: $("rightPhoto"),
  centerPhoto: $("centerPhoto"),
  municipio: $("municipio"),
  usuarioOrigen: $("usuarioOrigen"),
  qrImage: $("qrImage"),
  photoId: $("photoId"),
  progressBar: $("progressBar"),
  pauseFeedback: $("pauseFeedback"),
  pauseIcon: $("pauseIcon"),
  pauseText: $("pauseText"),
  imageError: $("imageError")
};

function imageUrl(photo) {
  return `/api/image?foto_id=${encodeURIComponent(photo.foto_id)}`;
}

function qrUrl(photo) {
  return `/api/qr?foto_id=${encodeURIComponent(photo.foto_id)}`;
}

function durationMs() {
  return Math.max(
    1,
    Number(state.current?.duracion_carrusel_segundos || 10)
  ) * 1000;
}

function nombreResponsable(photo) {
  const nombre = photo?.usuario_origen || "";
  if (!nombre) return "";

  const tipo = String(photo?.tipo_reporte || "").toLowerCase();

  return tipo === "coordinador"
    ? `Coordinador: ${nombre}`
    : `Promotor: ${nombre}`;
}

function municipioVisible(photo) {
  const municipio = String(photo?.municipio || "").trim();
  if (municipio) return municipio;

  const relacionados = String(
    photo?.municipios_relacionados || ""
  )
    .split("|")
    .map(v => v.trim())
    .filter(Boolean);

  if (relacionados.length === 1) {
    return relacionados[0];
  }

  if (relacionados.length > 1) {
    return "Varios municipios";
  }

  return "Municipio no especificado";
}

function showFeedback(paused) {
  clearTimeout(state.feedbackTimer);

  els.pauseIcon.textContent =
    paused ? "❚❚" : "▶";

  els.pauseText.textContent =
    paused ? "Pausado" : "Continuando";

  els.pauseFeedback.classList.add("show");

  state.feedbackTimer = setTimeout(() => {
    els.pauseFeedback.classList.remove("show");
  }, 750);
}

async function fetchWindow(index) {
  const response = await fetch(
    `/api/data?action=carrusel-window&index=${encodeURIComponent(index)}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function preloadPhoto(photo) {
  if (!photo?.foto_id) return;

  const image = new Image();
  image.src = imageUrl(photo);
}

function renderWindow(data) {
  if (!data?.current) {
    throw new Error("No hay fotografías para el carrusel.");
  }

  state.index = data.index;
  state.total = data.total;
  state.current = data.current;

  const prev = data.prev;
  const current = data.current;
  const next = data.next;

  els.leftPhoto.src = imageUrl(prev);
  els.rightPhoto.src = imageUrl(next);

  const currentUrl = imageUrl(current);

  els.centerPhoto.style.setProperty(
    "--current-photo",
    `url("${currentUrl}")`
  );

  els.mainPhoto.style.display = "block";
  els.imageError.classList.add("hidden");

  els.mainPhoto.onerror = () => {
    els.mainPhoto.style.display = "none";
    els.imageError.classList.remove("hidden");
  };

  els.mainPhoto.onload = () => {
    els.mainPhoto.style.display = "block";
    els.imageError.classList.add("hidden");
  };

  els.mainPhoto.src = currentUrl;

  els.municipio.textContent =
    municipioVisible(current);

  els.usuarioOrigen.textContent =
    nombreResponsable(current);

  if (els.photoId) {
    els.photoId.textContent =
      current.foto_id || "";
  }

  // En Vercel el QR apunta automáticamente al MISMO dominio.
  els.qrImage.src =
    `${qrUrl(current)}&v=${Date.now()}`;

  preloadPhoto(prev);
  preloadPhoto(next);
}

function resetTimer() {
  state.startedAt = performance.now();
  state.elapsedBeforePause = 0;
  els.progressBar.style.width = "0%";
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function navigateTo(targetIndex, direction) {
  if (state.animating) return;

  state.animating = true;
  const token = ++state.requestToken;

  try {
    const data = await fetchWindow(targetIndex);

    if (token !== state.requestToken) return;

    const className =
      direction === "prev"
        ? "stitch-moving-prev"
        : "stitch-moving-next";

    carouselVisual.classList.add(className);

    // La referencia de Stitch usa transición de 0.8 segundos.
    await sleep(690);

    carouselVisual.classList.add(
      "stitch-no-transition"
    );

    renderWindow(data);

    carouselVisual.classList.remove(
      "stitch-moving-prev",
      "stitch-moving-next"
    );

    void carouselVisual.offsetWidth;

    carouselVisual.classList.remove(
      "stitch-no-transition"
    );

    resetTimer();

  } catch (error) {
    console.error(error);
    els.municipio.textContent =
      "No se pudo cargar la fotografía";
    els.usuarioOrigen.textContent =
      "La conexión tuvo un corte temporal.";
  } finally {
    state.animating = false;
  }
}

function togglePause() {
  if (!state.current || state.animating) return;

  if (!state.paused) {
    state.elapsedBeforePause +=
      performance.now() - state.startedAt;

    state.paused = true;
  } else {
    state.paused = false;
    state.startedAt = performance.now();
  }

  showFeedback(state.paused);

  els.centerPhoto.classList.toggle(
    "is-paused",
    state.paused
  );
}

function tick(now) {
  if (
    !state.paused &&
    !state.animating &&
    state.current
  ) {
    const duration = durationMs();

    const elapsed =
      state.elapsedBeforePause +
      (now - state.startedAt);

    const ratio =
      Math.min(1, elapsed / duration);

    els.progressBar.style.width =
      `${ratio * 100}%`;

    if (elapsed >= duration) {
      navigateTo(
        state.index + 1,
        "next"
      );
    }
  }

  state.raf = requestAnimationFrame(tick);
}

$("prevBtn").addEventListener(
  "click",
  () => navigateTo(state.index - 1, "prev")
);

$("nextBtn").addEventListener(
  "click",
  () => navigateTo(state.index + 1, "next")
);

$("leftPhotoBtn").addEventListener(
  "click",
  () => navigateTo(state.index - 1, "prev")
);

$("rightPhotoBtn").addEventListener(
  "click",
  () => navigateTo(state.index + 1, "next")
);

els.centerPhoto.addEventListener(
  "click",
  togglePause
);

els.centerPhoto.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      togglePause();
    }
  }
);

document.addEventListener(
  "keydown",
  event => {
    if (event.key === "ArrowLeft") {
      navigateTo(state.index - 1, "prev");
    }

    if (event.key === "ArrowRight") {
      navigateTo(state.index + 1, "next");
    }
  }
);

(async function init() {
  try {
    const data = await fetchWindow(0);
    renderWindow(data);
    resetTimer();
    requestAnimationFrame(tick);
  } catch (error) {
    console.error(error);

    els.municipio.textContent =
      "No se pudo iniciar el carrusel";

    els.usuarioOrigen.textContent =
      "Revisa el catálogo y las variables de Google Drive.";
  }
})();
