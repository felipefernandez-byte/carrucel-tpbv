import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseCsv, matrixToObjects, stringifyCsv } from "./_lib/csv.mjs";

const ROOT = process.cwd();
const CATALOG = path.join(ROOT, "data", "catalogo_carrusel.csv");
const REVIEW = path.join(ROOT, "data", "revision_menores.csv");

if (!fs.existsSync(REVIEW)) {
  console.error("ERROR: No existe data/revision_menores.csv");
  process.exit(1);
}

const catalog = matrixToObjects(parseCsv(fs.readFileSync(CATALOG, "utf8")));
const review = matrixToObjects(parseCsv(fs.readFileSync(REVIEW, "utf8")));
const byId = new Map(review.rows.map(row => [String(row.foto_id), row]));

const unresolved = review.rows.filter(row => !["CON_MENORES", "SIN_MENORES"].includes(row.clasificacion));
if (unresolved.length) {
  console.error(`ERROR: Todavía hay ${unresolved.length.toLocaleString("es-MX")} fotografías por revisar.`);
  console.error("Ejecuta npm run revisar-menores y termina las dudosas antes de aplicar.");
  process.exit(1);
}

const missing = catalog.rows.filter(row => row.foto_id && !byId.has(String(row.foto_id)));
if (missing.length) {
  console.error(`ERROR: Faltan ${missing.length.toLocaleString("es-MX")} fotografías del catálogo en la revisión.`);
  process.exit(1);
}

const extraHeaders = [
  "revision_menores",
  "permitir_descarga",
  "fuente_revision_menores",
  "confianza_revision_menores",
  "observacion_revision_menores",
  "caras"
];
const headers = [...catalog.headers];
for (const h of extraHeaders) if (!headers.includes(h)) headers.push(h);

for (const row of catalog.rows) {
  if (!row.foto_id) continue;
  const r = byId.get(String(row.foto_id));
  row.revision_menores = r.clasificacion;
  row.permitir_descarga = r.clasificacion === "SIN_MENORES" ? "SI" : "NO";
  row.fuente_revision_menores = r.fuente_revision || "";
  row.confianza_revision_menores = r.confianza || "";
  row.observacion_revision_menores = r.observacion || "";
  row.caras = r.clasificacion === "SIN_MENORES" ? "" : (r.caras || "");
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(ROOT, "data", `catalogo_carrusel_antes_menores_${stamp}.csv`);
fs.copyFileSync(CATALOG, backup);
fs.writeFileSync(CATALOG, stringifyCsv(headers, catalog.rows), "utf8");

const counts = { CON_MENORES: 0, SIN_MENORES: 0 };
for (const row of review.rows) if (counts[row.clasificacion] !== undefined) counts[row.clasificacion]++;

console.log("");
console.log("==============================================");
console.log(" TPBV - REVISIÓN DE MENORES APLICADA");
console.log("==============================================");
console.log(`Descargables: ${counts.SIN_MENORES.toLocaleString("es-MX")}`);
console.log(`Protegidas:   ${counts.CON_MENORES.toLocaleString("es-MX")}`);
console.log(`Respaldo:     ${backup}`);
console.log("");

const build = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-catalog.mjs")], { stdio: "inherit" });
process.exit(build.status ?? 0);
