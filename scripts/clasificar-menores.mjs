import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseCsv, matrixToObjects, stringifyCsv } from "./_lib/csv.mjs";
import { loadLocalEnv } from "./_lib/env.mjs";
import { analyzeFaces, loadModels } from "./_lib/rostros.mjs";

const require = createRequire(import.meta.url);
const { fetchDriveMetadata, fetchCredentialedUrl } = require("../api/_lib/google.js");

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data", "catalogo_carrusel.csv");
const OUTPUT = path.join(ROOT, "data", "revision_menores.csv");

loadLocalEnv(ROOT);

// Un rostro es "menor" si su probabilidad estimada de ser menor de edad
// supera P_MENOR, y "dudoso" si supera P_DUDA. Las caras pequeñas son las
// que el estimador de edad calcula peor, por eso tienen un umbral más bajo.
const P_MENOR = Number(process.env.MENORES_P_MENOR || "0.5");
const P_DUDA = Number(process.env.MENORES_P_DUDA || "0.25");
const P_DUDA_CARA_PEQUENA = Number(process.env.MENORES_P_DUDA_PEQUENA || "0.15");
const CARA_PEQUENA_PX = 40;
// Caras de menos de 16 px (multitudes lejanas): no se puede reconocer a nadie
// y la edad estimada es ruido, así que no cuentan para decidir.
const CARA_MINIMA_PX = 16;
const CONCURRENCY = 4;
const FUENTE = "ROSTROS:yunet+fairface";

const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith("--limit="));
const force = args.includes("--force");
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 0) : 0;

if (!fs.existsSync(INPUT)) {
  console.error("ERROR: No existe data/catalogo_carrusel.csv");
  process.exit(1);
}

const source = matrixToObjects(parseCsv(fs.readFileSync(INPUT, "utf8")));
const catalogueRows = source.rows.filter(row => String(row.foto_id || "").trim());

const resultHeaders = [
  "foto_id",
  "drive_file_id",
  "clasificacion",
  "permitir_descarga",
  "confianza",
  "fuente_revision",
  "observacion",
  "caras",
  "caras_verificadas"
];

let resultRows = [];
if (fs.existsSync(OUTPUT) && !force) {
  resultRows = matrixToObjects(parseCsv(fs.readFileSync(OUTPUT, "utf8"))).rows;
}

const byId = new Map(resultRows.map(row => [String(row.foto_id), row]));

// Ya resuelta: la analizó este detector. Las decisiones de una persona
// (MANUAL) se respetan; solo se les agregan las caras si les faltan.
function isDone(row) {
  if (!row) return false;
  if (row.fuente_revision === "MANUAL") return Boolean(String(row.caras || "").trim());
  return String(row.fuente_revision || "").startsWith("ROSTROS:");
}

function thumbUrl(link) {
  const value = String(link || "");
  if (/=s\d+[^/]*$/i.test(value)) return value.replace(/=s\d+[^/]*$/i, "=w1600-h1600");
  return value + "=w1600-h1600";
}

// Misma miniatura de 1600 px que usa /api/image para difuminar, para que
// las coordenadas coincidan.
async function getImage(row) {
  const meta = await fetchDriveMetadata(row.drive_file_id);
  if (!meta.thumbnailLink) throw new Error("Drive no entregó thumbnailLink");
  const response = await fetchCredentialedUrl(thumbUrl(meta.thumbnailLink), meta._accessToken);
  if (!response.ok) throw new Error(`No se pudo obtener miniatura (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

function classifyFaces(faces) {
  const counts = f => f.sizePx >= CARA_MINIMA_PX;
  const isMinor = f => counts(f) && f.pMinor >= P_MENOR;
  const isDoubtful = f => counts(f) &&
    (f.pMinor >= P_DUDA || (f.sizePx < CARA_PEQUENA_PX && f.pMinor >= P_DUDA_CARA_PEQUENA));

  const minors = faces.filter(isMinor).length;
  const doubtful = faces.filter(f => !isMinor(f) && isDoubtful(f)).length;
  const maxP = faces.reduce((m, f) => Math.max(m, f.pMinor), 0);

  let clasificacion = "SIN_MENORES";
  if (minors) clasificacion = "CON_MENORES";
  else if (doubtful) clasificacion = "REVISAR";

  const observacion = faces.length
    ? `${faces.length} rostro(s): ${minors} menor(es), ${doubtful} dudoso(s). Edades estimadas: ` +
      faces.map(f => f.edad).join(", ")
    : "Sin rostros visibles";

  // Se guardan TODAS las caras de todas las fotos: si el responsable marca
  // la foto como "con menores", se difuminan todas sin volver a analizarla.
  // (El catálogo público solo las usa en fotos protegidas.)
  const caras = faces.length
    ? faces.map(f => f.box.map(n => n.toFixed(4)).join(" ")).join(";")
    : "NINGUNA";

  return {
    clasificacion,
    confianza: (clasificacion === "SIN_MENORES" ? 1 - maxP : maxP).toFixed(2),
    observacion,
    caras
  };
}

// La pantalla de revisión (05_REVISAR_DUDOSAS) escribe en el mismo archivo
// mientras este proceso corre. Antes de guardar se relee el archivo:
// - las filas de disco se conservan (incluidas las que creó la persona);
// - de las fotos recién analizadas se toma el resultado en memoria, salvo
//   que la persona ya las haya decidido: su decisión gana y solo se le
//   agregan las caras.
const freshIds = new Set();

function save() {
  if (fs.existsSync(OUTPUT)) {
    const diskRows = matrixToObjects(parseCsv(fs.readFileSync(OUTPUT, "utf8"))).rows;
    for (const diskRow of diskRows) {
      const id = String(diskRow.foto_id);
      const memRow = byId.get(id);
      if (!freshIds.has(id) || !memRow) {
        byId.set(id, diskRow);
      } else if (diskRow.fuente_revision === "MANUAL" && memRow.fuente_revision !== "MANUAL") {
        byId.set(id, { ...diskRow, caras: memRow.caras || diskRow.caras });
      }
    }
  }
  freshIds.clear();
  const ordered = catalogueRows
    .map(row => byId.get(String(row.foto_id)))
    .filter(Boolean);
  fs.writeFileSync(OUTPUT, stringifyCsv(resultHeaders, ordered), "utf8");
}

function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

await loadModels();

const pending = catalogueRows.filter(row => !isDone(byId.get(String(row.foto_id).trim())));
const toProcess = limit ? pending.slice(0, limit) : pending;

console.log("");
console.log("==============================================");
console.log(" TPBV - CLASIFICACIÓN LOCAL DE MENORES");
console.log("==============================================");
console.log("Motor: detector de rostros + estimador de edad (local, sin internet para la IA)");
console.log(`Umbrales: menor >= ${P_MENOR}, dudoso >= ${P_DUDA}`);
console.log(`Fotografías catálogo: ${catalogueRows.length.toLocaleString("es-MX")}`);
console.log(`Ya resueltas:         ${(catalogueRows.length - pending.length).toLocaleString("es-MX")}`);
console.log(`Por analizar ahora:   ${toProcess.length.toLocaleString("es-MX")}`);
console.log("El avance se guarda en data/revision_menores.csv.");
console.log("");

const startedAt = Date.now();
let processed = 0;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 10;
const counts = { SIN_MENORES: 0, CON_MENORES: 0, REVISAR: 0, ERROR: 0 };

async function processRow(row) {
  const fotoId = String(row.foto_id).trim();
  let result;

  try {
    const { faces } = await analyzeFaces(await getImage(row));
    const c = classifyFaces(faces);
    // La decisión humana no se toca, solo se le agregan las caras.
    const previous = byId.get(fotoId);
    result = previous?.fuente_revision === "MANUAL" ? { ...previous, caras: c.caras } : {
      foto_id: fotoId,
      drive_file_id: row.drive_file_id || "",
      clasificacion: c.clasificacion,
      permitir_descarga: c.clasificacion === "SIN_MENORES" ? "SI" : "NO",
      confianza: c.confianza,
      fuente_revision: FUENTE,
      observacion: c.observacion,
      caras: c.caras,
      caras_verificadas: ""
    };
    consecutiveErrors = 0;
    counts[c.clasificacion]++;
  } catch (error) {
    consecutiveErrors++;
    counts.ERROR++;
    result = {
      foto_id: fotoId,
      drive_file_id: row.drive_file_id || "",
      clasificacion: "REVISAR",
      permitir_descarga: "NO",
      confianza: "",
      fuente_revision: "ERROR_LOCAL",
      observacion: String(error?.message || error).slice(0, 500),
      caras: "",
      caras_verificadas: ""
    };
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      byId.set(fotoId, result);
      freshIds.add(fotoId);
      save();
      console.error("");
      console.error(`ERROR: ${MAX_CONSECUTIVE_ERRORS} fallas seguidas. Último error: ${result.observacion}`);
      console.error("Revisa la conexión a internet (Google Drive) y vuelve a ejecutar.");
      console.error("El avance quedó guardado; continuará donde se quedó.");
      process.exit(1);
    }
  }

  byId.set(fotoId, result);
  freshIds.add(fotoId);
  processed++;

  if (processed % 10 === 0 || processed === toProcess.length) {
    save();
    const avgMs = (Date.now() - startedAt) / processed;
    console.log(
      `[${processed.toLocaleString("es-MX")}/${toProcess.length.toLocaleString("es-MX")}] ` +
      `sin menores ${counts.SIN_MENORES} · con menores ${counts.CON_MENORES} · ` +
      `dudosas ${counts.REVISAR} · errores ${counts.ERROR}` +
      `  (${(avgMs / 1000).toFixed(2)} s/foto, faltan ~${formatDuration(avgMs * (toProcess.length - processed))})`
    );
  }
}

// Varias fotos a la vez: la mayor parte del tiempo es la descarga desde Drive.
let next = 0;
async function worker() {
  while (next < toProcess.length) {
    const row = toProcess[next++];
    await processRow(row);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
save();

const finalRows = [...byId.values()];
const totals = { SIN_MENORES: 0, CON_MENORES: 0, REVISAR: 0 };
for (const row of finalRows) {
  if (totals[row.clasificacion] !== undefined) totals[row.clasificacion]++;
}

console.log("");
console.log("Resultado acumulado:");
console.log(` SIN_MENORES: ${totals.SIN_MENORES.toLocaleString("es-MX")}`);
console.log(` CON_MENORES: ${totals.CON_MENORES.toLocaleString("es-MX")}`);
console.log(` REVISAR:     ${totals.REVISAR.toLocaleString("es-MX")}`);
console.log(` Tiempo de esta ejecución: ${formatDuration(Date.now() - startedAt)}`);
console.log(`Archivo: ${OUTPUT}`);
console.log("Siguiente paso: 05_REVISAR_DUDOSAS.bat");
console.log("");
