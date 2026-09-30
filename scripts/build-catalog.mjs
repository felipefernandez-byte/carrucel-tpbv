import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data", "catalogo_carrusel.csv");
const EXTRA = path.join(ROOT, "data", "catalogo_nuevas.csv");
const OUTPUT_DIR =path.join(ROOT, "generated");
const OUTPUT = path.join(OUTPUT_DIR, "catalog.min.json");
const REVIEW = path.join(ROOT, "data", "revision_menores.csv");

// Segundos que dura cada foto en el carrusel, igual para todas. Manda sobre la
// columna del CSV (que viene en 10) para que no se pierda al cargar un catálogo nuevo.
const DURACION_CARRUSEL_SEGUNDOS = "8";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("es-MX")
    .replace(/\s+/g, " ");
}

function splitPipe(value) {
  return String(value ?? "")
    .split("|")
    .map(v => v.trim())
    .filter(Boolean);
}

if (!fs.existsSync(INPUT)) {
  console.error("ERROR: No existe data/catalogo_carrusel.csv");
  process.exit(1);
}

const raw = fs.readFileSync(INPUT, "utf8").replace(/^\uFEFF/, "");
const matrix = parseCsv(raw);

if (matrix.length < 2) {
  console.error("ERROR: El catálogo está vacío.");
  process.exit(1);
}

const headers = matrix[0].map(h => h.trim());

// Lotes por evento (scripts/importar-nuevas.mjs) viven en su propio archivo
// para que sobrevivan cuando se carga un catálogo principal nuevo.
if (fs.existsSync(EXTRA)) {
  const extra = parseCsv(fs.readFileSync(EXTRA, "utf8").replace(/^﻿/, ""));
  const extraHeaders = (extra[0] || []).map(h => h.trim());
  extraHeaders.forEach(h => { if (!headers.includes(h)) headers.push(h); });
  for (const values of extra.slice(1)) {
    const byName = new Map(extraHeaders.map((h, i) => [h, values[i] ?? ""]));
    matrix.push(headers.map(h => byName.get(h) ?? ""));
  }
}

const required = [
  "foto_id",
  "drive_file_id",
  "tipo_asociacion",
  "municipio",
  "localidad",
  "localidades_relacionadas",
  "tipo_reporte",
  "usuario_origen",
  "mostrar_carrusel"
];

const missing = required.filter(name => !headers.includes(name));
if (missing.length) {
  console.error("ERROR: El catálogo no contiene columnas requeridas:");
  missing.forEach(name => console.error(" - " + name));
  process.exit(1);
}

// La revisión de menores vive en su propio archivo (data/revision_menores.csv)
// para que sobreviva cuando se carga un catálogo nuevo con 01_CARGAR_NUEVO_CATALOGO.
// Si el archivo existe, la protección está activa: toda foto sin veredicto
// definitivo (nueva, REVISAR o con error) queda bloqueada para descarga.
const reviewById = new Map();
const protectionActive = fs.existsSync(REVIEW);

if (protectionActive) {
  const reviewMatrix = parseCsv(
    fs.readFileSync(REVIEW, "utf8").replace(/^﻿/, "")
  );
  const reviewHeaders = (reviewMatrix[0] || []).map(h => h.trim());
  for (const values of reviewMatrix.slice(1)) {
    const r = {};
    reviewHeaders.forEach((h, i) => { r[h] = values[i] ?? ""; });
    const id = String(r.foto_id || "").trim();
    if (id) reviewById.set(id, r);
  }
}

const reviewCounts = { SIN_MENORES: 0, CON_MENORES: 0, PENDIENTE: 0 };

function reviewFields(row, fotoId) {
  const r = reviewById.get(fotoId);

  if (r) {
    // Solo cuenta como definitiva la decisión de una persona (MANUAL). Lo que
    // dijo el detector automático queda como pendiente: bloqueado y difuminado.
    const manual = r.fuente_revision === "MANUAL";
    const raw = String(r.clasificacion || "").trim().toUpperCase();
    const clasificacion = manual ? raw : "REVISAR";
    const definitiva = clasificacion === "SIN_MENORES" || clasificacion === "CON_MENORES";
    reviewCounts[definitiva ? clasificacion : "PENDIENTE"]++;
    return {
      revision_menores: definitiva ? clasificacion : "REVISAR",
      permitir_descarga: clasificacion === "SIN_MENORES" ? "SI" : "NO",
      fuente_revision_menores: r.fuente_revision || "",
      confianza_revision_menores: r.confianza || "",
      observacion_revision_menores: r.observacion || "",
      caras: clasificacion === "SIN_MENORES" ? "" : (r.caras || "")
    };
  }

  if (protectionActive) {
    reviewCounts.PENDIENTE++;
    return {
      revision_menores: "PENDIENTE",
      permitir_descarga: "NO",
      fuente_revision_menores: "",
      confianza_revision_menores: "",
      observacion_revision_menores: "Fotografía nueva sin clasificar",
      caras: ""
    };
  }

  // Sin archivo de revisión: se respetan las columnas del CSV (comportamiento legado).
  return {
    revision_menores: row.revision_menores || "",
    permitir_descarga: row.permitir_descarga || "",
    fuente_revision_menores: row.fuente_revision_menores || "",
    confianza_revision_menores: row.confianza_revision_menores || "",
    observacion_revision_menores: row.observacion_revision_menores || "",
    caras: row.caras || ""
  };
}

const photos = [];
const byId = {};
const localities = {};
const municipalities = {};
const events = {};
const carousel = [];
let descartadas = 0;

for (let i = 1; i < matrix.length; i++) {
  const values = matrix[i];
  if (!values.length || values.every(v => !String(v).trim())) continue;

  const row = {};
  headers.forEach((header, index) => {
    row[header] = values[index] ?? "";
  });

  const fotoId = String(row.foto_id || "").trim();
  const driveId = String(row.drive_file_id || "").trim();

  if (!fotoId || !driveId) continue;

  // "No mostrar": la persona la descartó. No entra al sitio (ni carrusel, ni
  // galerías, ni /foto/ID); el original en Drive queda intacto.
  const review = reviewById.get(fotoId);
  if (review?.fuente_revision === "MANUAL" &&
      String(review.clasificacion || "").trim().toUpperCase() === "DESCARTADA") {
    descartadas++;
    continue;
  }

  const compact = {
    foto_id: fotoId,
    nombre_archivo: row.nombre_archivo || "",
    drive_file_id: driveId,
    drive_view_url: row.drive_view_url || "",
    tipo_asociacion: row.tipo_asociacion || "",
    accion_al_escanear: row.accion_al_escanear || "",
    region: row.region || "",
    municipio: row.municipio || "",
    localidad: row.localidad || "",
    regiones_relacionadas: row.regiones_relacionadas || "",
    municipios_relacionados: row.municipios_relacionados || "",
    localidades_relacionadas: row.localidades_relacionadas || "",
    cantidad_localidades: row.cantidad_localidades || "",
    tipo_reporte: row.tipo_reporte || "",
    usuario_origen: row.usuario_origen || "",
    registro_softr_id: row.registro_softr_id || "",
    campo_evidencia: row.campo_evidencia || "",
    duracion_carrusel_segundos: DURACION_CARRUSEL_SEGUNDOS,
    mostrar_carrusel: row.mostrar_carrusel || "",

    // Evento (opcional). Los lotes nuevos llegan por municipio y evento;
    // el catálogo actual no trae estas columnas y quedan vacías.
    evento: String(row.evento || "").trim(),
    evento_id: String(row.evento_id || "").trim(),
    fecha_evento: String(row.fecha_evento || "").trim(),

    // Protección de descarga por revisión previa de presencia de menores.
    ...reviewFields(row, fotoId)
  };

  const index = photos.length;
  photos.push(compact);
  byId[fotoId] = index;

  // Solo las imágenes válidas para mostrar participan en carrusel y galerías.
  if (String(compact.mostrar_carrusel).trim().toUpperCase() !== "SI") {
    continue;
  }

  // Con la protección activa, en el carrusel (proyector) solo aparecen las
  // fotos que una persona ya revisó: sin menores (normales, con QR) y con
  // menores (caras difuminadas, sin QR). Las pendientes no se proyectan.
  const approvedForCarousel = protectionActive
    ? compact.fuente_revision_menores === "MANUAL" &&
      (compact.revision_menores === "SIN_MENORES" || compact.revision_menores === "CON_MENORES")
    : true;

  if (approvedForCarousel) {
    carousel.push(index);
  }

  const locs = new Set();
  if (compact.localidad) locs.add(compact.localidad);
  splitPipe(compact.localidades_relacionadas).forEach(v => locs.add(v));

  for (const loc of locs) {
    const key = norm(loc);
    if (!localities[key]) localities[key] = [];
    localities[key].push(index);
  }

  const munis = new Set();
  if (compact.municipio) munis.add(compact.municipio);
  splitPipe(compact.municipios_relacionados).forEach(v => munis.add(v));

  for (const muni of munis) {
    const key = norm(muni);
    if (!municipalities[key]) municipalities[key] = [];
    municipalities[key].push(index);
  }

  // Se indexa por evento_id si existe; si no, por el nombre del evento.
  const eventKey = norm(compact.evento_id || compact.evento);
  if (eventKey) {
    if (!events[eventKey]) events[eventKey] = [];
    events[eventKey].push(index);
  }
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

fs.writeFileSync(
  OUTPUT,
  JSON.stringify({
    photos,
    byId,
    localities,
    municipalities,
    events,
    carousel
  })
);

console.log("");
console.log("==============================================");
console.log(" TPBV - CATALOGO PREPARADO");
console.log("==============================================");
console.log(`Filas con foto_id:       ${photos.length.toLocaleString("es-MX")}`);
console.log(`Fotos para carrusel:     ${carousel.length.toLocaleString("es-MX")}`);
console.log(`Localidades indexadas:   ${Object.keys(localities).length.toLocaleString("es-MX")}`);
console.log(`Municipios indexados:    ${Object.keys(municipalities).length.toLocaleString("es-MX")}`);
console.log(`Eventos indexados:       ${Object.keys(events).length.toLocaleString("es-MX")}`);
if (protectionActive) {
  console.log("Protección de menores:   ACTIVA (data/revision_menores.csv)");
  console.log(`  Descargables:          ${reviewCounts.SIN_MENORES.toLocaleString("es-MX")}`);
  console.log(`  Con menores:           ${reviewCounts.CON_MENORES.toLocaleString("es-MX")}`);
  console.log(`  Pendientes (bloq.):    ${reviewCounts.PENDIENTE.toLocaleString("es-MX")}`);
  console.log(`  No mostrar (fuera):    ${descartadas.toLocaleString("es-MX")}`);
} else {
  console.log("Protección de menores:   sin data/revision_menores.csv (todas descargables)");
}
console.log("Archivo generado: generated/catalog.min.json");
console.log("");
