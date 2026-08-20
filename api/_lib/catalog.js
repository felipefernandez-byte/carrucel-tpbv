const fs = require("node:fs");
const path = require("node:path");

let cache = null;

function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("es-MX")
    .replace(/\s+/g, " ");
}

function loadCatalog() {
  if (cache) return cache;

  const file = path.join(process.cwd(), "generated", "catalog.min.json");
  cache = JSON.parse(fs.readFileSync(file, "utf8"));
  return cache;
}

function getPhoto(fotoId) {
  const data = loadCatalog();
  const index = data.byId[String(fotoId || "")];

  if (index === undefined) return null;
  return data.photos[index] || null;
}

function getCarouselWindow(rawIndex) {
  const data = loadCatalog();
  const total = data.carousel.length;

  if (!total) {
    return {
      total: 0,
      index: 0,
      prev: null,
      current: null,
      next: null
    };
  }

  const parsed = Number(rawIndex || 0);
  const index = ((Number.isFinite(parsed) ? parsed : 0) % total + total) % total;

  const currentPhotoIndex = data.carousel[index];
  const prevPhotoIndex = data.carousel[(index - 1 + total) % total];
  const nextPhotoIndex = data.carousel[(index + 1) % total];

  return {
    total,
    index,
    prev: data.photos[prevPhotoIndex],
    current: data.photos[currentPhotoIndex],
    next: data.photos[nextPhotoIndex]
  };
}

function getPhotosBy({ localidad, municipio, limit = 120 }) {
  const data = loadCatalog();
  let indexes = [];

  if (localidad) {
    indexes = data.localities[norm(localidad)] || [];
  } else if (municipio) {
    indexes = data.municipalities[norm(municipio)] || [];
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 120, 250));

  return {
    total: indexes.length,
    items: indexes
      .slice(0, safeLimit)
      .map(index => data.photos[index])
  };
}

module.exports = {
  loadCatalog,
  getPhoto,
  getCarouselWindow,
  getPhotosBy
};
