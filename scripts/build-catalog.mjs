import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data", "catalogo_carrusel.csv");
const OUTPUT_DIR = path.join(ROOT, "generated");
const OUTPUT = path.join(OUTPUT_DIR, "catalog.min.json");

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

const photos = [];
const byId = {};
const localities = {};
const municipalities = {};
const carousel = [];

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
    duracion_carrusel_segundos: row.duracion_carrusel_segundos || "10",
    mostrar_carrusel: row.mostrar_carrusel || ""
  };

  const index = photos.length;
  photos.push(compact);
  byId[fotoId] = index;

  // Solo las imágenes válidas para mostrar participan en carrusel y galerías.
  if (String(compact.mostrar_carrusel).trim().toUpperCase() !== "SI") {
    continue;
  }

  carousel.push(index);

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
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

fs.writeFileSync(
  OUTPUT,
  JSON.stringify({
    photos,
    byId,
    localities,
    municipalities,
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
console.log("Archivo generado: generated/catalog.min.json");
console.log("");
