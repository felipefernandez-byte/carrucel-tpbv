// Importa un lote de fotos organizado en carpetas:
//   imagenes_nuevas/<Región>/<Municipio, Promotor>/<Evento>/[<Subevento>/]foto.jpeg
// Sube cada foto a Google Drive (carpeta TPBV_imagenes_nuevas, mismas
// subcarpetas) y la agrega a data/catalogo_nuevas.csv con región, municipio,
// promotor y evento. Se puede correr varias veces: lo ya subido se salta.
// Los videos se ignoran (el carrusel solo muestra fotos).
//
// Uso: node scripts/importar-nuevas.mjs [carpeta]   (por omisión imagenes_nuevas)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { parseCsv, matrixToObjects, stringifyCsv } from "./_lib/csv.mjs";
import { loadLocalEnv } from "./_lib/env.mjs";

const require = createRequire(import.meta.url);
const { getAccessToken } = require("../api/_lib/google.js");

const ROOT = process.cwd();
const SOURCE = path.resolve(ROOT, process.argv.slice(2).find(a => !a.startsWith("--")) || "imagenes_nuevas");
const CATALOG = path.join(ROOT, "data", "catalogo_carrusel.csv");
const OUTPUT = path.join(ROOT, "data", "catalogo_nuevas.csv");
const DRIVE_ROOT_NAME = "TPBV_imagenes_nuevas";
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

loadLocalEnv(ROOT);

const HEADERS = [
  "foto_id", "nombre_archivo", "drive_file_id", "drive_view_url", "tipo_asociacion",
  "accion_al_escanear", "region", "municipio", "localidad", "regiones_relacionadas",
  "municipios_relacionados", "localidades_relacionadas", "cantidad_localidades",
  "tipo_reporte", "usuario_origen", "registro_softr_id", "campo_evidencia", "qr_path",
  "qr_url", "duracion_carrusel_segundos", "mostrar_carrusel", "sha256_contenido",
  "tamano_bytes", "cantidad_urls_fuente", "evento", "evento_id", "fecha_evento", "ruta_origen"
];

const norm = v => String(v ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .trim().toLowerCase().replace(/\s+/g, " ");
const slug = v => norm(v).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Municipios y regiones tal como ya aparecen en el catálogo principal.
const mainRows = fs.existsSync(CATALOG) ? matrixToObjects(parseCsv(fs.readFileSync(CATALOG, "utf8"))).rows : [];
const knownMunicipio = new Map();
const regionByMunicipio = new Map();
for (const r of mainRows) {
  if (!r.municipio) continue;
  knownMunicipio.set(norm(r.municipio), r.municipio);
  if (r.region && !regionByMunicipio.has(r.municipio)) regionByMunicipio.set(r.municipio, r.region);
}
const MUNICIPIO_ALIAS = {
  "e. zapata": "Emiliano Zapata",
  "jonacatepec": "Jonacatepec de Leandro Valle",
  "tlaltizapan": "Tlaltizapán de Zapata"
};

function regionFromFolder(name) {
  const n = norm(name);
  if (n.includes("altos")) return "Altos";
  if (n.includes("oriente")) return "Oriente";
  if (n.includes("centro")) return "Centro";
  if (n.includes("sur")) return "Sur";
  return "";
}

function municipioFromFolder(name) {
  const raw = String(name).split(",")[0].trim();
  return MUNICIPIO_ALIAS[norm(raw)] || knownMunicipio.get(norm(raw)) || raw;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];

function fechaDe(text) {
  const t = norm(text);
  let m = t.match(/(20\d\d)-(\d\d)-(\d\d)/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/(\d{1,2}) de (\w+) de (20\d\d)/);
  if (m && MESES.includes(m[2])) return `${m[3]}-${String(MESES.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/(\d\d)-(\d\d)-\s?(20\d\d)/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/(?:^|\D)(\d\d)(\d\d)(20\d\d)(?:\D|$)/);
  if (m && +m[1] <= 31 && +m[2] <= 12) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

// Si la foto no está dentro de una carpeta de evento, su nombre suele
// describirlo ("Entrega de Jitomate 2026-06-19"); se limpia quitando fechas y
// numeración. Los nombres automáticos de WhatsApp no dicen nada.
function eventoDesdeArchivo(file) {
  const base = path.basename(file, path.extname(file));
  if (/^whatsapp image/i.test(base)) return "";
  return base
    .replace(/\(\w+\)/g, " ")
    .replace(/\d{1,2} de \w+ de 20\d\d/gi, " ")
    .replace(/\d{1,2}-\d{1,2}-\s?20\d\d|20\d\d-\d\d-\d\d|\b\d{8}\b/g, " ")
    .replace(/[\s.,]+\d{1,2}[\s.,]*$/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s.,]+$/g, "")
    .trim();
}

// Quita signos sueltos al inicio o al final ("Techumbre }", "Calmecac-").
const limpiar = v => String(v).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, "").trim();

function describe(rel) {
  const parts = rel.split(/[\\/]/);
  const file = parts.pop();
  const [regionDir, muniDir, ...eventDirs] = parts;
  const municipio = muniDir ? municipioFromFolder(muniDir) : "";
  const promotor = muniDir && muniDir.includes(",") ? muniDir.split(",").slice(1).join(",").trim() : "";
  const region = regionFromFolder(regionDir) || regionByMunicipio.get(municipio) || "";
  const evento = limpiar(eventDirs.length ? eventDirs[eventDirs.length - 1] : eventoDesdeArchivo(file));
  return {
    region, municipio, promotor, evento,
    evento_id: evento ? slug(`${municipio || region} ${eventDirs.join(" ") || evento}`) : "",
    fecha_evento: fechaDe(file) || fechaDe(eventDirs.join(" "))
  };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// ---------- Google Drive ----------

async function drive(url, options = {}) {
  for (let attempt = 1; ; attempt++) {
    const token = await getAccessToken();
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    if (response.ok) return response.json();
    const retry = response.status === 429 || response.status >= 500;
    if (!retry || attempt >= 5) throw new Error(`Drive ${response.status}: ${(await response.text()).slice(0, 300)}`);
    await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
  }
}

const folderCache = new Map();

async function ensureFolder(name, parentId) {
  const key = `${parentId || "root"}/${name}`;
  if (folderCache.has(key)) return folderCache.get(key);
  const q = `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId || "root"}' in parents`;
  const found = await drive(`https://www.googleapis.com/drive/v3/files?fields=files(id)&q=${encodeURIComponent(q)}`);
  const id = found.files?.[0]?.id || (await drive("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) })
  })).id;
  folderCache.set(key, id);
  return id;
}

async function ensureFolderPath(dirs) {
  let parent = await ensureFolder(DRIVE_ROOT_NAME, null);
  for (const dir of dirs) parent = await ensureFolder(dir, parent);
  return parent;
}

async function upload(file, name, parentId) {
  const boundary = "tpbv" + crypto.randomBytes(8).toString("hex");
  const meta = JSON.stringify({ name, parents: [parentId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${MIME[path.extname(file).toLowerCase()]}\r\n\r\n`),
    fs.readFileSync(file),
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const data = await drive("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  return data.id;
}

// ---------- Proceso ----------

if (!fs.existsSync(SOURCE)) {
  console.error(`ERROR: no existe la carpeta ${SOURCE}`);
  process.exit(1);
}

const existing = fs.existsSync(OUTPUT) ? matrixToObjects(parseCsv(fs.readFileSync(OUTPUT, "utf8"))).rows : [];
const knownSha = new Set([...mainRows, ...existing].map(r => r.sha256_contenido).filter(Boolean));
const rows = [...existing];
const save = () => fs.writeFileSync(OUTPUT, "﻿" + stringifyCsv(HEADERS, rows), "utf8");

const files = walk(SOURCE);
let added = 0, duplicated = 0, failed = 0;
console.log(`Fotos encontradas: ${files.length.toLocaleString("es-MX")} (los videos se ignoran)`);

// --prueba: muestra cómo se clasificaría cada evento, sin subir nada.
if (process.argv.includes("--prueba")) {
  const events = new Map();
  for (const file of files) {
    const info = describe(path.relative(SOURCE, file));
    const key = [info.region, info.municipio, info.promotor, info.evento || "(sin evento)"].join(" | ");
    const e = events.get(key) || { n: 0, fechas: new Set() };
    e.n++;
    if (info.fecha_evento) e.fechas.add(info.fecha_evento);
    events.set(key, e);
  }
  for (const [key, e] of [...events].sort()) console.log(`${String(e.n).padStart(4)}  ${key}  ${[...e.fechas].join(" ")}`);
  process.exit(0);
}

for (const [i, file] of files.entries()) {
  const rel = path.relative(SOURCE, file);
  try {
    const sha = sha256(file);
    if (knownSha.has(sha)) { duplicated++; continue; }

    const info = describe(rel);
    const fotoId = "FOTO-" + sha.slice(0, 10).toUpperCase();
    const parentId = await ensureFolderPath(path.dirname(rel).split(/[\\/]/).filter(d => d && d !== "."));
    const driveId = await upload(file, path.basename(file), parentId);

    rows.push({
      foto_id: fotoId,
      nombre_archivo: path.basename(file),
      drive_file_id: driveId,
      drive_view_url: `https://drive.google.com/file/d/${driveId}/view`,
      tipo_asociacion: info.municipio ? "MUNICIPIO" : "REGION",
      accion_al_escanear: info.municipio ? "MOSTRAR_MUNICIPIO" : "MOSTRAR_REGION",
      region: info.region,
      municipio: info.municipio,
      localidad: "",
      regiones_relacionadas: info.region,
      municipios_relacionados: info.municipio,
      localidades_relacionadas: "",
      cantidad_localidades: "0",
      tipo_reporte: "Promotor",
      usuario_origen: info.promotor,
      registro_softr_id: "",
      campo_evidencia: "Lote por evento",
      qr_path: `/foto/${fotoId}`,
      qr_url: "",
      duracion_carrusel_segundos: "10",
      mostrar_carrusel: "SI",
      sha256_contenido: sha,
      tamano_bytes: String(fs.statSync(file).size),
      cantidad_urls_fuente: "1",
      evento: info.evento,
      evento_id: info.evento_id,
      fecha_evento: info.fecha_evento,
      ruta_origen: rel.replace(/\\/g, "/")
    });
    knownSha.add(sha);
    added++;
    // Se guarda cada 20 fotos para poder retomar si algo se interrumpe.
    if (added % 20 === 0) {
      save();
      console.log(`  ${i + 1}/${files.length} · subidas ${added}`);
    }
  } catch (error) {
    failed++;
    console.error(`  ERROR en ${rel}: ${error.message}`);
  }
}

save();
console.log("");
console.log("==============================================");
console.log(" TPBV - IMPORTACIÓN DE FOTOS NUEVAS");
console.log("==============================================");
console.log(`Subidas y agregadas:   ${added.toLocaleString("es-MX")}`);
console.log(`Ya existían (iguales): ${duplicated.toLocaleString("es-MX")}`);
console.log(`Con error:             ${failed.toLocaleString("es-MX")}${failed ? "  (vuelve a correr el script para reintentar)" : ""}`);
console.log(`Total en data/catalogo_nuevas.csv: ${rows.length.toLocaleString("es-MX")}`);
