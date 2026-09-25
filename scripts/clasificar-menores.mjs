import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseCsv, matrixToObjects, stringifyCsv } from "./_lib/csv.mjs";
import { loadLocalEnv } from "./_lib/env.mjs";

const require = createRequire(import.meta.url);
const { fetchDriveMetadata, fetchCredentialedUrl } = require("../api/_lib/google.js");
const sharp = require("sharp");

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data", "catalogo_carrusel.csv");
const OUTPUT = path.join(ROOT, "data", "revision_menores.csv");

loadLocalEnv(ROOT);

const OLLAMA_URL = String(process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const MODEL = String(process.env.OLLAMA_VISION_MODEL || "qwen2.5vl:7b").trim();
const REVIEW_THRESHOLD = Number(process.env.MENORES_UMBRAL_REVISION || "0.86");

const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith("--limit="));
const force = args.includes("--force");
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 0) : 0;

if (!fs.existsSync(INPUT)) {
  console.error("ERROR: No existe data/catalogo_carrusel.csv");
  process.exit(1);
}

function normalizeModelName(value) {
  return String(value || "").trim().toLowerCase();
}

async function checkOllama() {
  let response;
  try {
    response = await fetch(`${OLLAMA_URL}/api/tags`);
  } catch {
    console.error("");
    console.error("ERROR: No pude conectarme con Ollama en " + OLLAMA_URL);
    console.error("Abre Ollama y vuelve a ejecutar este proceso.");
    console.error("");
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`ERROR: Ollama respondió HTTP ${response.status}`);
    process.exit(1);
  }

  const data = await response.json();
  const models = (data.models || []).map(item => normalizeModelName(item.name || item.model));
  const wanted = normalizeModelName(MODEL);
  const wantedBase = wanted.split(":")[0];
  const found = models.some(name => name === wanted || name.split(":")[0] === wantedBase);

  if (!found) {
    console.error("");
    console.error(`ERROR: El modelo ${MODEL} no está instalado en Ollama.`);
    console.error(`Ejecuta primero: ollama pull ${MODEL}`);
    console.error("");
    process.exit(1);
  }
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
  resultRows = matrixToObjects(parseCsv(fs.readFileSync(OUTPUT, "utf8"))).rows
    // Las fotos que fallaron (Drive u Ollama caídos) se vuelven a intentar.
    .filter(row => row.fuente_revision !== "ERROR_LOCAL");
}

const byId = new Map(resultRows.map(row => [String(row.foto_id), row]));

function thumbUrl(link) {
  const value = String(link || "");
  if (!value) return "";
  if (/=s\d+[^/]*$/i.test(value)) return value.replace(/=s\d+[^/]*$/i, "=w896-h896");
  return value + "=w896-h896";
}

async function getImage(row) {
  const meta = await fetchDriveMetadata(row.drive_file_id);
  if (!meta.thumbnailLink) throw new Error("Drive no entregó thumbnailLink");

  const response = await fetchCredentialedUrl(
    thumbUrl(meta.thumbnailLink),
    meta._accessToken
  );

  if (!response.ok) throw new Error(`No se pudo obtener miniatura (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const { width, height } = await sharp(bytes).metadata();
  return { base64: bytes.toString("base64"), width, height };
}

async function askOllama(prompt, imageBase64) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{
        role: "user",
        content: prompt,
        images: [imageBase64]
      }],
      stream: false,
      format: "json",
      options: {
        temperature: 0
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Ollama respondió ${response.status}`);
  }

  const content = data?.message?.content;
  if (!content) throw new Error("Ollama no devolvió contenido");

  return JSON.parse(cleanJsonText(content));
}

function cleanJsonText(value) {
  let text = String(value || "").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
}

function normalizeClassification(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (["SIN_MENORES", "CON_MENORES", "REVISAR"].includes(raw)) return raw;
  return "REVISAR";
}

async function classify(image) {
  const prompt = [
    "Analiza esta fotografía únicamente para decidir si debe bloquearse su descarga por posible presencia de personas menores de 18 años.",
    "No identifiques personas, no adivines nombres y no calcules edades exactas.",
    "Responde CON_MENORES si aparece claramente o razonablemente un niño, niña o adolescente.",
    "Responde SIN_MENORES solo cuando sea razonablemente claro que no aparecen menores.",
    "Responde REVISAR si existe cualquier duda: adolescentes de edad incierta, personas lejanas, pequeñas, parcialmente visibles, de espaldas, rostros ocultos, baja resolución, multitudes o cualquier caso ambiguo.",
    "Ante la duda usa REVISAR.",
    "Primero describe brevemente cuántas personas ves y qué rasgos de edad aparentan (estatura relativa, proporciones, rasgos faciales, uniforme escolar), y después decide.",
    "Devuelve SOLO JSON válido con esta forma exacta:",
    '{"observacion":"descripción breve sin identificar personas","personas_visibles":0,"posibles_menores":0,"clasificacion":"SIN_MENORES|CON_MENORES|REVISAR","confianza":0.0}'
  ].join(" ");

  const parsed = await askOllama(prompt, image.base64);
  let clasificacion = normalizeClassification(parsed.clasificacion);
  let confianza = Number(parsed.confianza);
  if (!Number.isFinite(confianza)) confianza = 0;
  confianza = Math.max(0, Math.min(1, confianza));

  // Si el modelo cuenta posibles menores pero dice SIN_MENORES, se contradice.
  if (clasificacion === "SIN_MENORES" && Number(parsed.posibles_menores) > 0) {
    clasificacion = "REVISAR";
  }

  // Regla conservadora: si el propio modelo reporta baja confianza,
  // la foto se manda a revisión manual aunque haya elegido SI/NO.
  if (clasificacion !== "REVISAR" && confianza < REVIEW_THRESHOLD) {
    clasificacion = "REVISAR";
  }

  return {
    clasificacion,
    confianza,
    observacion: String(parsed.observacion || "").slice(0, 500)
  };
}

// Qwen2.5-VL entrega cajas en píxeles de la imagen que recibió. Se guardan
// relativas (0 a 1) para aplicarlas a la imagen de cualquier tamaño.
function normalizeBoxes(rawList, width, height) {
  const boxes = (Array.isArray(rawList) ? rawList : [])
    .map(item => Array.isArray(item) ? item : (item?.bbox_2d || item?.bbox))
    .filter(box => Array.isArray(box) && box.length === 4 && box.every(n => Number.isFinite(Number(n))))
    .map(box => box.map(Number));

  if (!boxes.length) return [];

  const maxValue = Math.max(...boxes.flat());
  let scaleX = width;
  let scaleY = height;

  if (maxValue <= 1) {
    scaleX = 1;
    scaleY = 1;
  } else if (
    boxes.some(b => b[2] > width * 1.05 || b[3] > height * 1.05) &&
    maxValue <= 1000
  ) {
    // Algunas versiones responden en escala 0-1000.
    scaleX = 1000;
    scaleY = 1000;
  }

  const clamp = n => Math.max(0, Math.min(1, n));

  return boxes
    .map(([x1, y1, x2, y2]) => [
      clamp(Math.min(x1, x2) / scaleX),
      clamp(Math.min(y1, y2) / scaleY),
      clamp(Math.max(x1, x2) / scaleX),
      clamp(Math.max(y1, y2) / scaleY)
    ])
    .filter(([x1, y1, x2, y2]) => x2 - x1 > 0.002 && y2 - y1 > 0.002);
}

async function detectFaces(image) {
  const prompt = [
    "Localiza TODOS los rostros o cabezas humanas visibles en esta imagen:",
    "de frente, de perfil, de espaldas, pequeños, lejanos, borrosos o parcialmente ocultos.",
    "No identifiques personas.",
    `La imagen mide ${image.width}x${image.height} píxeles.`,
    "Devuelve SOLO JSON válido con esta forma:",
    '{"rostros":[{"bbox_2d":[x1,y1,x2,y2]}]}',
    "con coordenadas en píxeles. Si no hay ninguno devuelve {\"rostros\":[]}."
  ].join(" ");

  const parsed = await askOllama(prompt, image.base64);
  const boxes = normalizeBoxes(parsed.rostros || parsed.faces || parsed, image.width, image.height);

  if (!boxes.length) return "NINGUNA";
  return boxes.map(b => b.map(n => n.toFixed(4)).join(" ")).join(";");
}

function needsFaces(row) {
  return row.clasificacion !== "SIN_MENORES" &&
    row.fuente_revision !== "ERROR_LOCAL" &&
    !String(row.caras || "").trim();
}

function save() {
  const ordered = catalogueRows
    .map(row => byId.get(String(row.foto_id)))
    .filter(Boolean);
  fs.writeFileSync(OUTPUT, stringifyCsv(resultHeaders, ordered), "utf8");
}

await checkOllama();

console.log("");
console.log("==============================================");
console.log(" TPBV - CLASIFICACIÓN LOCAL DE MENORES");
console.log("==============================================");
console.log(`Ollama: ${OLLAMA_URL}`);
console.log(`Modelo: ${MODEL}`);
console.log(`Umbral para revisión: ${REVIEW_THRESHOLD}`);
console.log(`Fotografías catálogo: ${catalogueRows.length.toLocaleString("es-MX")}`);
console.log(`Ya clasificadas: ${byId.size.toLocaleString("es-MX")}`);
if (limit) console.log(`Modo prueba: máximo ${limit.toLocaleString("es-MX")} nuevas fotografías`);
console.log("La IA se ejecuta localmente. El avance se guarda en data/revision_menores.csv.");
console.log("");

let processedThisRun = 0;
let done = byId.size;
const startedAt = Date.now();
const pendingTotal = catalogueRows.filter(row => !byId.has(String(row.foto_id || "").trim())).length;
const toProcess = limit ? Math.min(limit, pendingTotal) : pendingTotal;

function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

for (const row of catalogueRows) {
  const fotoId = String(row.foto_id || "").trim();
  if (!fotoId || byId.has(fotoId)) continue;
  if (limit && processedThisRun >= limit) break;

  try {
    const image = await getImage(row);
    const result = await classify(image);
    const permitir = result.clasificacion === "SIN_MENORES" ? "SI" : "NO";

    // Solo las fotos que se van a difuminar necesitan rostros ubicados.
    let caras = "";
    if (permitir === "NO") {
      try {
        caras = await detectFaces(image);
      } catch {
        caras = "";
      }
    }

    byId.set(fotoId, {
      foto_id: fotoId,
      drive_file_id: row.drive_file_id || "",
      clasificacion: result.clasificacion,
      permitir_descarga: permitir,
      confianza: String(result.confianza),
      fuente_revision: `OLLAMA:${MODEL}`,
      observacion: result.observacion || "",
      caras,
      caras_verificadas: ""
    });
  } catch (error) {
    byId.set(fotoId, {
      foto_id: fotoId,
      drive_file_id: row.drive_file_id || "",
      clasificacion: "REVISAR",
      permitir_descarga: "NO",
      confianza: "",
      fuente_revision: "ERROR_LOCAL",
      observacion: String(error?.message || error).slice(0, 500)
    });
  }

  processedThisRun++;
  done++;
  save();

  const current = byId.get(fotoId);
  const avgMs = (Date.now() - startedAt) / processedThisRun;
  const remaining = toProcess - processedThisRun;
  console.log(
    `[${done.toLocaleString("es-MX")}/${catalogueRows.length.toLocaleString("es-MX")}] ` +
    `${fotoId} -> ${current.clasificacion}` +
    `  (${(avgMs / 1000).toFixed(1)} s/foto, faltan ~${formatDuration(avgMs * remaining)})`
  );
}

// Fotos protegidas que todavía no tienen rostros ubicados
// (clasificadas antes de existir el difuminado o con falla en la detección).
const missingFaces = [...byId.values()].filter(needsFaces);
if (missingFaces.length) {
  console.log("");
  console.log(`Ubicando rostros en ${missingFaces.length.toLocaleString("es-MX")} fotografías protegidas...`);
  const sourceById = new Map(catalogueRows.map(row => [String(row.foto_id), row]));
  let n = 0;
  for (const row of missingFaces) {
    if (limit && n >= limit) break;
    n++;
    try {
      const image = await getImage(sourceById.get(row.foto_id) || row);
      row.caras = await detectFaces(image);
      save();
      console.log(`  ${row.foto_id} -> ${row.caras === "NINGUNA" ? "sin rostros" : row.caras.split(";").length + " rostro(s)"}`);
    } catch (error) {
      console.log(`  ${row.foto_id} -> error: ${String(error?.message || error).slice(0, 120)}`);
    }
  }
}

const finalRows = [...byId.values()];
const counts = { SIN_MENORES: 0, CON_MENORES: 0, REVISAR: 0 };
for (const row of finalRows) {
  const key = row.clasificacion;
  if (counts[key] !== undefined) counts[key]++;
}

console.log("");
console.log("Resultado acumulado:");
console.log(` SIN_MENORES: ${counts.SIN_MENORES.toLocaleString("es-MX")}`);
console.log(` CON_MENORES: ${counts.CON_MENORES.toLocaleString("es-MX")}`);
console.log(` REVISAR:     ${counts.REVISAR.toLocaleString("es-MX")}`);
console.log(` Procesadas en esta ejecución: ${processedThisRun.toLocaleString("es-MX")}`);
console.log(`Archivo: ${OUTPUT}`);
console.log("");
