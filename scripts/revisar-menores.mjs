import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { parseCsv, matrixToObjects, stringifyCsv } from "./_lib/csv.mjs";
import { loadLocalEnv } from "./_lib/env.mjs";

const require = createRequire(import.meta.url);
const { fetchDriveMetadata, fetchCredentialedUrl } = require("../api/_lib/google.js");
const { blurImage } = require("../api/_lib/blur.js");

const ROOT = process.cwd();
const FILE = path.join(ROOT, "data", "revision_menores.csv");

loadLocalEnv(ROOT);

const PORT = Number(process.env.REVISION_MENORES_PORT || 4317);

if (!fs.existsSync(FILE)) {
  console.error("ERROR: No existe data/revision_menores.csv. Ejecuta primero npm run clasificar-menores.");
  process.exit(1);
}

const headers = [
  "foto_id", "drive_file_id", "clasificacion", "permitir_descarga",
  "confianza", "fuente_revision", "observacion", "caras", "caras_verificadas"
];

function readRows() {
  return matrixToObjects(parseCsv(fs.readFileSync(FILE, "utf8"))).rows;
}

function writeRows(rows) {
  fs.writeFileSync(FILE, stringifyCsv(headers, rows), "utf8");
}

// Etapa 1: fotos dudosas. Etapa 2: fotos protegidas cuyo difuminado
// todavía no ha confirmado una persona.
function pendingDoubtful(rows) {
  return rows.filter(row => row.clasificacion === "REVISAR");
}

function pendingBlurCheck(rows) {
  return rows.filter(row =>
    row.clasificacion === "CON_MENORES" &&
    row.caras_verificadas !== "SI"
  );
}

function thumbUrl(link, size) {
  const value = String(link || "");
  if (/=s\d+[^/]*$/i.test(value)) return value.replace(/=s\d+[^/]*$/i, `=w${size}-h${size}`);
  return value + `=w${size}-h${size}`;
}

async function fetchThumb(row, size) {
  const meta = await fetchDriveMetadata(row.drive_file_id);
  const response = await fetchCredentialedUrl(thumbUrl(meta.thumbnailLink, size), meta._accessToken);
  if (!response.ok) throw new Error("Drive no pudo entregar la imagen");
  return Buffer.from(await response.arrayBuffer());
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TPBV · Revisión de fotografías</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f4f2;color:#272a25;font-family:Arial,sans-serif}.wrap{max-width:1050px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:15px;align-items:end;margin-bottom:16px}.ey{font-size:11px;font-weight:800;letter-spacing:.12em;color:#773357}.count{font-weight:800}.card{background:#fff;border:1px solid #e1ded7;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.06)}.imgbox{height:min(65vh,720px);display:grid;place-items:center;background:#e9e7e1}.imgbox img{width:100%;height:100%;object-fit:contain}.meta{padding:16px 18px;border-top:1px solid #eee}.meta strong{display:block;font-size:18px}.meta p{margin:7px 0 0;color:#666}.actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:16px}.actions button{min-height:56px;border:0;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer}.yes{background:#773357;color:white}.no{background:#3d4a39;color:white}.alt{background:#d9d4c7;color:#272a25}.empty{padding:70px 20px;text-align:center}.hint{text-align:center;color:#777;font-size:12px;margin-top:10px}@media(max-width:600px){.wrap{padding:12px}.top{align-items:start;flex-direction:column}.imgbox{height:58vh}}
</style></head><body><main class="wrap"><div class="top"><div><div class="ey">REVISIÓN LOCAL · NO SE PUBLICA</div><h1 id="title">Fotografías dudosas</h1></div><div id="count" class="count"></div></div><div id="root"></div><p class="hint" id="hint"></p></main>
<script>
let state={etapa:'dudosas',rows:[]};let current=null;
const ETAPAS={
  dudosas:{title:'Fotografías dudosas',hint:'Teclas: 1 = contiene menores · 2 = no contiene menores',img:'/img/',
    buttons:[['yes','1','Sí, contiene menores','CON_MENORES'],['no','2','No contiene menores','SIN_MENORES']]},
  difuminado:{title:'Verificar difuminado',hint:'Así se verá en público. Teclas: 1 = difuminado correcto · 2 = difuminar foto completa · 3 = no contiene menores',img:'/blur/',
    buttons:[['no','1','Difuminado correcto','OK'],['yes','2','Se ve algún rostro: difuminar completa','COMPLETA'],['alt','3','No contiene menores','SIN_MENORES']]}
};
async function load(){const r=await fetch('/api/pending');state=await r.json();render()}
function render(){const root=document.getElementById('root');const et=ETAPAS[state.etapa]||ETAPAS.dudosas;
document.getElementById('title').textContent=et.title;document.getElementById('hint').textContent=et.hint;
document.getElementById('count').textContent=state.rows.length+' pendientes';
if(!state.rows.length){root.innerHTML='<div class="card empty"><h2>Revisión terminada</h2><p>No quedan fotografías dudosas ni difuminados por verificar.</p></div>';current=null;return;}
current=state.rows[0];
root.innerHTML='<div class="card"><div class="imgbox"><img src="'+et.img+encodeURIComponent(current.foto_id)+'?t='+Date.now()+'" alt="Fotografía para revisar"></div><div class="meta"><strong>'+escapeHtml(current.foto_id)+'</strong><p>'+escapeHtml(current.observacion||'Sin observación automática')+'</p></div></div><div class="actions">'+
et.buttons.map(b=>'<button class="'+b[0]+'" onclick="decide(\\''+b[3]+'\\')">'+b[1]+' · '+b[2]+'</button>').join('')+'</div>';}
function escapeHtml(s){return String(s).replace(/[&<>\\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;'}[c]))}
async function decide(value){if(!current)return;await fetch('/api/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({foto_id:current.foto_id,etapa:state.etapa,decision:value})});await load()}
document.addEventListener('keydown',e=>{const et=ETAPAS[state.etapa];if(!et)return;const b=et.buttons.find(b=>b[1]===e.key);if(b)decide(b[3])});load();
</script></body></html>`;

function applyDecision(row, etapa, decision) {
  if (etapa === "dudosas") {
    if (!["CON_MENORES", "SIN_MENORES"].includes(decision)) return false;
    row.clasificacion = decision;
    row.permitir_descarga = decision === "SIN_MENORES" ? "SI" : "NO";
    row.fuente_revision = "MANUAL";
    row.confianza = "1";
    row.observacion = "Revisada manualmente por responsable TPBV";
    return true;
  }

  if (etapa === "difuminado") {
    if (decision === "OK") {
      row.caras_verificadas = "SI";
      return true;
    }
    if (decision === "COMPLETA") {
      row.caras = "COMPLETA";
      row.caras_verificadas = "SI";
      return true;
    }
    if (decision === "SIN_MENORES") {
      row.clasificacion = "SIN_MENORES";
      row.permitir_descarga = "SI";
      row.fuente_revision = "MANUAL";
      row.confianza = "1";
      row.observacion = "Revisada manualmente por responsable TPBV";
      row.caras = "";
      row.caras_verificadas = "";
      return true;
    }
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }

    if (url.pathname === "/api/pending") {
      const rows = readRows();
      const doubtful = pendingDoubtful(rows);
      if (doubtful.length) return sendJson(res, 200, { etapa: "dudosas", rows: doubtful });
      return sendJson(res, 200, { etapa: "difuminado", rows: pendingBlurCheck(rows) });
    }

    if (url.pathname === "/api/decision" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body || "{}");
      const rows = readRows();
      const row = rows.find(r => r.foto_id === payload.foto_id);
      if (!row) return sendJson(res, 404, { error: "Foto no encontrada" });
      if (!applyDecision(row, payload.etapa, payload.decision)) {
        return sendJson(res, 400, { error: "Decisión inválida" });
      }
      writeRows(rows);
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname.startsWith("/img/") || url.pathname.startsWith("/blur/")) {
      const blurred = url.pathname.startsWith("/blur/");
      const fotoId = decodeURIComponent(url.pathname.slice(blurred ? 6 : 5));
      const row = readRows().find(r => r.foto_id === fotoId);
      if (!row) { res.writeHead(404); return res.end("No encontrada"); }
      let bytes = await fetchThumb(row, blurred ? 1600 : 1200);
      if (blurred) bytes = await blurImage(bytes, row.caras);
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" });
      return res.end(bytes);
    }

    res.writeHead(404); res.end("No encontrado");
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: String(error?.message || error) });
  }
});

server.listen(PORT, () => {
  const rows = readRows();
  console.log("");
  console.log("==============================================");
  console.log(" TPBV - REVISIÓN MANUAL");
  console.log("==============================================");
  console.log(`Dudosas:                 ${pendingDoubtful(rows).length.toLocaleString("es-MX")}`);
  console.log(`Difuminados por revisar: ${pendingBlurCheck(rows).length.toLocaleString("es-MX")}`);
  console.log(`Abre: http://localhost:${PORT}`);
  console.log("");
});
