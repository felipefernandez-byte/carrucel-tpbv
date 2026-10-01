import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { parseCsv, matrixToObjects, stringifyCsv } from "./_lib/csv.mjs";
import { loadLocalEnv } from "./_lib/env.mjs";
import { analyzeFaces } from "./_lib/rostros.mjs";

const require = createRequire(import.meta.url);
const { fetchDriveMetadata, fetchCredentialedUrl } = require("../api/_lib/google.js");
const { blurImage, parseFaces } = require("../api/_lib/blur.js");

const ROOT = process.cwd();
const FILE = path.join(ROOT, "data", "revision_menores.csv");
const CATALOG = path.join(ROOT, "data", "catalogo_carrusel.csv");
const CATALOG_NUEVAS = path.join(ROOT, "data", "catalogo_nuevas.csv");

loadLocalEnv(ROOT);

const PORT = Number(process.env.REVISION_MENORES_PORT || 4317);

const headers = [
  "foto_id", "drive_file_id", "clasificacion", "permitir_descarga",
  "confianza", "fuente_revision", "observacion", "caras", "caras_verificadas"
];

// Orden y Drive ID de cada foto: la revisión recorre el catálogo completo
// (principal y, al final, los lotes por evento de data/catalogo_nuevas.csv).
const catalog = [CATALOG, CATALOG_NUEVAS]
  .filter(file => fs.existsSync(file))
  .flatMap(file => matrixToObjects(parseCsv(fs.readFileSync(file, "utf8"))).rows)
  .filter(row => String(row.foto_id || "").trim())
  .map(row => ({
    foto_id: String(row.foto_id).trim(),
    drive_file_id: row.drive_file_id || "",
    lugar: [row.municipio || row.region, row.evento].filter(Boolean).join(" · ")
  }));
const lugarById = new Map(catalog.map(row => [row.foto_id, row.lugar]));
const driveById = new Map(catalog.map(row => [row.foto_id, row.drive_file_id]));

function readRows() {
  if (!fs.existsSync(FILE)) return [];
  return matrixToObjects(parseCsv(fs.readFileSync(FILE, "utf8"))).rows;
}

function writeRows(rows) {
  const order = new Map(catalog.map((row, i) => [row.foto_id, i]));
  rows.sort((a, b) => (order.get(a.foto_id) ?? 1e9) - (order.get(b.foto_id) ?? 1e9));
  fs.writeFileSync(FILE, stringifyCsv(headers, rows), "utf8");
}

// Lee, modifica y escribe en un solo paso (sin esperas de por medio) para no
// pisar lo que el clasificador escribe en paralelo.
function updateRow(fotoId, change) {
  const rows = readRows();
  let row = rows.find(r => r.foto_id === fotoId);
  const previous = row ? { ...row } : null;
  if (!row) {
    row = { foto_id: fotoId, drive_file_id: driveById.get(fotoId) || "" };
    rows.push(row);
  }
  change(row);
  writeRows(rows);
  return { previous, row };
}

const isManual = row => row?.fuente_revision === "MANUAL";

// Etapa 1: la persona decide cada foto del catálogo.
// Etapa 2: difuminados sin confirmar (normalmente se confirman en el momento).
function pendingManual(byId) {
  const pending = catalog.filter(c => !isManual(byId.get(c.foto_id)));
  // Las fotos reabiertas para decidir de nuevo van primero.
  const reopened = c => byId.get(c.foto_id)?.fuente_revision === "ROSTROS:reabierta";
  return [...pending.filter(reopened), ...pending.filter(c => !reopened(c))];
}

function pendingBlurCheck(rows) {
  return rows.filter(row =>
    isManual(row) && row.clasificacion === "CON_MENORES" && row.caras_verificadas !== "SI"
  );
}

function suggestion(row) {
  if (row?.fuente_revision === "ROSTROS:reabierta") return "Ya la habías marcado con menores; decide de nuevo";
  if (!row || !String(row.fuente_revision || "").startsWith("ROSTROS:")) return "El detector aún no la analiza";
  if (row.clasificacion === "CON_MENORES") return "Detector: parece que hay menores";
  if (row.clasificacion === "REVISAR") return "Detector: dudosa";
  return "Detector: no encontró menores";
}

function thumbUrl(link, size) {
  const value = String(link || "");
  if (/=s\d+[^/]*$/i.test(value)) return value.replace(/=s\d+[^/]*$/i, `=w${size}-h${size}`);
  return value + `=w${size}-h${size}`;
}

async function fetchThumb(fotoId, size) {
  const meta = await fetchDriveMetadata(driveById.get(fotoId));
  const response = await fetchCredentialedUrl(thumbUrl(meta.thumbnailLink, size), meta._accessToken);
  if (!response.ok) throw new Error("Drive no pudo entregar la imagen");
  return Buffer.from(await response.arrayBuffer());
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || "{}");
}

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TPBV · Revisión de fotografías</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f4f2;color:#272a25;font-family:Arial,sans-serif}.wrap{max-width:1400px;margin:auto;padding:14px 20px}.top{display:flex;justify-content:space-between;gap:15px;align-items:end;margin-bottom:12px}.top h1{margin:4px 0 0;font-size:26px}.ey{font-size:11px;font-weight:800;letter-spacing:.12em;color:#773357}.count{font-weight:800}.card{background:#fff;border:1px solid #e1ded7;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.06)}.imgbox{min-height:300px;display:grid;place-items:center;background:#e9e7e1;padding:6px}.pic{position:relative;display:inline-block;line-height:0;user-select:none}.pic img{display:block;max-width:100%;max-height:74vh;min-height:55vh;object-fit:contain}.loading{color:#777;font-size:14px;padding:40px;line-height:1.4}.face{position:absolute;border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.6);cursor:pointer;border-radius:4px}.face:hover{border-color:#ffd24d}.face.sel{border:3px solid #e0245e;background:rgba(224,36,94,.35)}.draw{position:absolute;border:2px solid #ffd24d;background:rgba(255,210,77,.2);pointer-events:none}.selecting .pic{cursor:crosshair}.meta{padding:12px 18px;border-top:1px solid #eee;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.meta strong{font-size:16px}.meta span{color:#666;font-size:14px}.actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px}.actions button{min-height:58px;border:0;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer}.yes{background:#773357;color:white}.no{background:#3d4a39;color:white}.alt{background:#d9d4c7;color:#272a25}.actions .hide{background:#fff;color:#8a2c2c;border:2px solid #8a2c2c}.undo{margin-top:10px;background:none;border:1px solid #cfc9bb;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:13px}.empty{padding:70px 20px;text-align:center}.hint{text-align:center;color:#555;font-size:13px;margin-top:10px}.progress{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.progress span{background:#fff;border:1px solid #e1ded7;border-radius:999px;padding:6px 12px;font-size:13px}.progress b{color:#773357}.step{display:inline-block;background:#773357;color:#fff;border-radius:999px;padding:3px 10px;font-size:12px;margin-left:8px;vertical-align:middle}
</style></head><body><main class="wrap">
<div class="top"><div><div class="ey">REVISIÓN LOCAL · NO SE PUBLICA</div><h1 id="title"></h1></div><div id="count" class="count"></div></div>
<div class="progress" id="progress"></div><div id="root"></div>
<div style="text-align:center"><button class="undo" id="undoBtn" onclick="undo()" hidden>↶ Deshacer la última (Z)</button></div>
<p class="hint" id="hint"></p></main>
<script>
let state={etapa:'manual',rows:[],progreso:null};
let current=null;      // {foto_id, sugerencia, modo:'decidir'|'seleccionar'}
let forced=null;       // foto a la que se regresa (deshacer o paso de selección)
let busy=false;
let boxes=[];          // [{b:[x1,y1,x2,y2], sel:bool, manual:bool}] en coordenadas 0-1
const history=[];
const n=v=>Number(v).toLocaleString('es-MX');
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function load(){
  const r=await fetch('/api/pending');state=await r.json();
  if(forced){current=forced;forced=null;}
  else if(state.rows.length){current={...state.rows[0],modo:state.etapa==='seleccion'?'seleccionar':'decidir'};}
  else current=null;
  boxes=[];
  render();
  if(current&&current.modo==='seleccionar')loadFaces(current.foto_id);
  state.rows.slice(1,4).forEach(r=>{const i=new Image();i.src='/img/'+encodeURIComponent(r.foto_id);});
}
async function loadFaces(id){
  const r=await fetch('/api/caras/'+encodeURIComponent(id));const d=await r.json();
  if(!current||current.foto_id!==id)return;
  boxes=(d.detectadas||[]).map(b=>({b,sel:false,manual:false}));
  // Lo que ya habías elegido antes aparece seleccionado.
  (d.elegidas||[]).forEach(b=>{const m=boxes.find(x=>iou(x.b,b)>0.3);if(m)m.sel=true;else boxes.push({b,sel:true,manual:true});});
  drawBoxes();
}
function iou(a,b){const ix=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])),iy=Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));const i=ix*iy,u=(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i;return u>0?i/u:0}
function render(){
  const p=state.progreso;
  if(p)document.getElementById('progress').innerHTML='<span>Decididas por ti <b>'+n(p.decididas)+'</b> de '+n(p.total)+'</span><span>Con menores <b>'+n(p.con)+'</b></span><span>Sin menores <b>'+n(p.sin)+'</b></span><span>No mostrar <b>'+n(p.descartadas)+'</b></span>';
  document.getElementById('count').textContent=p?n(p.total-p.decididas)+' por decidir':'';
  document.getElementById('undoBtn').hidden=!history.length;
  const root=document.getElementById('root');
  if(!current){document.getElementById('title').textContent='Revisión terminada';document.getElementById('hint').textContent='';
    root.innerHTML='<div class="card empty"><h2>¡Listo!</h2><p>Ya decidiste todas las fotografías.</p></div>';return;}
  const sel=current.modo==='seleccionar';
  document.getElementById('title').innerHTML=sel?'Haz clic en las caras de los menores<span class="step">Paso 2</span>':'¿Hay menores en esta foto?';
  document.getElementById('hint').textContent=sel
    ?'1) Haz clic en el recuadro blanco de cada niño o niña: se pone ROJO. 2) Si un niño no tiene recuadro, arrastra el mouse sobre su cara. 3) Presiona Enter. · Si no hay menores: tecla 2 · No mostrar: tecla 3'
    :'Teclas: 1 = sí hay menores · 2 = no hay menores · 3 = no mostrar · Z = deshacer';
  const hide='<button class="hide" onclick="discard()">3 · No mostrar</button>';
  const buttons=sel
    ?'<button class="yes" onclick="saveFaces()">Enter · Guardar caras en rojo</button><button class="alt" onclick="saveComplete()">C · Difuminar foto completa</button><button class="no" onclick="notMinors()">2 · No hay menores</button>'+hide
    :'<button class="yes" onclick="decide(\\'CON_MENORES\\')">1 · Sí hay menores</button><button class="no" onclick="decide(\\'SIN_MENORES\\')">2 · No hay menores</button>'+hide;
  root.innerHTML='<div class="card'+(sel?' selecting':'')+'"><div class="imgbox"><div class="pic" id="pic"><div class="loading" id="loading">Cargando fotografía…</div><img id="photo" src="/img/'+encodeURIComponent(current.foto_id)+'" alt="Fotografía para revisar" hidden></div></div><div class="meta"><strong>'+escapeHtml(current.foto_id)+(current.lugar?' · '+escapeHtml(current.lugar):'')+'</strong><span id="metaText">'+escapeHtml(sel?'Buscando caras…':(current.sugerencia||''))+'</span></div></div><div class="actions">'+buttons+'</div>';
  const img=document.getElementById('photo');
  img.onload=()=>{img.hidden=false;document.getElementById('loading')?.remove();drawBoxes();};
  if(sel)setupDrawing();
}
function drawBoxes(){
  const pic=document.getElementById('pic');if(!pic||!current||current.modo!=='seleccionar')return;
  pic.querySelectorAll('.face').forEach(e=>e.remove());
  boxes.forEach((x,i)=>{const d=document.createElement('div');d.className='face'+(x.sel?' sel':'');
    d.style.left=(x.b[0]*100)+'%';d.style.top=(x.b[1]*100)+'%';d.style.width=((x.b[2]-x.b[0])*100)+'%';d.style.height=((x.b[3]-x.b[1])*100)+'%';
    d.onmousedown=e=>e.stopPropagation();
    d.onclick=e=>{e.stopPropagation();if(x.manual&&x.sel){boxes.splice(i,1);}else x.sel=!x.sel;drawBoxes();};
    pic.appendChild(d);});
  const t=document.getElementById('metaText');
  if(t){const s=boxes.filter(x=>x.sel).length;t.textContent=boxes.length?(s+' cara(s) seleccionada(s) de '+boxes.length):'No se encontraron caras: arrastra para marcarlas o usa C';}
}
function setupDrawing(){
  const pic=document.getElementById('pic');let start=null,rect=null,el=null;
  const pos=e=>{const r=pic.getBoundingClientRect();return[Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))]};
  pic.onmousedown=e=>{if(e.button!==0)return;e.preventDefault();start=pos(e);el=document.createElement('div');el.className='draw';pic.appendChild(el);};
  window.onmousemove=e=>{if(!start)return;const p=pos(e);rect=[Math.min(start[0],p[0]),Math.min(start[1],p[1]),Math.max(start[0],p[0]),Math.max(start[1],p[1])];
    el.style.left=rect[0]*100+'%';el.style.top=rect[1]*100+'%';el.style.width=(rect[2]-rect[0])*100+'%';el.style.height=(rect[3]-rect[1])*100+'%';};
  window.onmouseup=()=>{if(!start)return;el?.remove();if(rect&&rect[2]-rect[0]>0.008&&rect[3]-rect[1]>0.008){boxes.push({b:rect,sel:true,manual:true});drawBoxes();}start=null;rect=null;el=null;};
}
async function post(etapa,decision,extra){
  const r=await fetch('/api/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({foto_id:current.foto_id,etapa,decision,...(extra||{})})});
  const data=await r.json();if(!r.ok){alert(data.error||'Error');return null;}
  history.push({foto_id:current.foto_id,previous:data.previous,modo:current.modo,sugerencia:current.sugerencia});
  return data;
}
async function decide(value){
  if(!current||busy||current.modo!=='decidir')return;busy=true;
  try{
    const id=current.foto_id;
    if(!await post('manual',value))return;
    // Con menores: en la misma foto original se eligen las caras a difuminar.
    if(value==='CON_MENORES')forced={foto_id:id,modo:'seleccionar',lugar:current.lugar};
    await load();
  }finally{busy=false;}
}
async function saveFaces(){
  if(!current||busy||current.modo!=='seleccionar')return;
  const chosen=boxes.filter(x=>x.sel).map(x=>x.b);
  if(!chosen.length){if(!confirm('No seleccionaste ninguna cara. ¿Difuminar la foto completa?'))return;return saveComplete();}
  busy=true;try{if(await post('seleccion','CARAS',{caras:chosen}))await load();}finally{busy=false;}
}
async function notMinors(){
  if(!current||busy||current.modo!=='seleccionar')return;busy=true;
  try{if(await post('manual','SIN_MENORES'))await load();}finally{busy=false;}
}
// Descarte: la foto no se muestra en ningún lado; el original en Drive no se toca.
async function discard(){
  if(!current||busy)return;busy=true;
  try{if(await post('manual','DESCARTADA'))await load();}finally{busy=false;}
}
async function saveComplete(){
  if(!current||busy||current.modo!=='seleccionar')return;busy=true;
  try{if(await post('seleccion','COMPLETA'))await load();}finally{busy=false;}
}
async function undo(){
  const last=history.pop();if(!last||busy)return;busy=true;
  try{
    await fetch('/api/undo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({foto_id:last.foto_id,previous:last.previous})});
    forced={foto_id:last.foto_id,modo:last.modo,sugerencia:last.sugerencia};
    await load();
  }finally{busy=false;}
}
document.addEventListener('keydown',e=>{
  if(e.key==='z'||e.key==='Z'){undo();return;}
  if(!current)return;
  if(current.modo==='decidir'){if(e.key==='1')decide('CON_MENORES');if(e.key==='2')decide('SIN_MENORES');}
  else{if(e.key==='Enter')saveFaces();if(e.key==='c'||e.key==='C')saveComplete();if(e.key==='2')notMinors();}
  if(e.key==='3')discard();
});
setInterval(()=>{if(!current)load()},30000);
load();
</script></body></html>`;

function applyDecision(row, etapa, decision, payload) {
  if (etapa === "manual") {
    if (!["CON_MENORES", "SIN_MENORES", "DESCARTADA"].includes(decision)) return false;
    row.clasificacion = decision;
    row.permitir_descarga = decision === "SIN_MENORES" ? "SI" : "NO";
    row.fuente_revision = "MANUAL";
    row.confianza = "1";
    row.observacion = decision === "DESCARTADA"
      ? "Descartada por responsable TPBV: no se muestra"
      : "Revisada manualmente por responsable TPBV";
    // Las caras a difuminar las elige la persona en el paso 2.
    row.caras_verificadas = "";
    return true;
  }

  if (etapa === "seleccion") {
    if (decision === "COMPLETA") {
      row.caras = "COMPLETA";
      row.caras_verificadas = "SI";
      return true;
    }
    if (decision === "CARAS") {
      const list = (Array.isArray(payload?.caras) ? payload.caras : [])
        .map(b => (Array.isArray(b) ? b.map(Number) : []))
        .filter(b => b.length === 4 && b.every(v => Number.isFinite(v) && v >= 0 && v <= 1) && b[2] > b[0] && b[3] > b[1]);
      if (!list.length) return false;
      row.caras = list.map(b => b.map(v => v.toFixed(4)).join(" ")).join(";");
      row.caras_verificadas = "SI";
      return true;
    }
  }

  return false;
}

// Si el detector todavía no llegó a esta foto, se ubican sus caras aquí mismo.
async function ensureFaces(fotoId, image) {
  const row = readRows().find(r => r.foto_id === fotoId);
  if (row && String(row.caras || "").trim()) return row.caras;
  const { faces } = await analyzeFaces(image);
  const caras = faces.length
    ? faces.map(f => f.box.map(n => n.toFixed(4)).join(" ")).join(";")
    : "NINGUNA";
  updateRow(fotoId, r => {
    if (!String(r.caras || "").trim()) r.caras = caras;
  });
  return caras;
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
      const byId = new Map(rows.map(r => [r.foto_id, r]));
      const manualRows = rows.filter(isManual);
      const progreso = {
        total: catalog.length,
        decididas: manualRows.length,
        con: manualRows.filter(r => r.clasificacion === "CON_MENORES").length,
        sin: manualRows.filter(r => r.clasificacion === "SIN_MENORES").length,
        descartadas: manualRows.filter(r => r.clasificacion === "DESCARTADA").length,
        analizadas: rows.filter(r => String(r.fuente_revision || "").startsWith("ROSTROS:") || String(r.caras || "").trim()).length
      };
      // Primero, fotos con menores a las que falta elegir qué caras difuminar.
      const seleccion = pendingBlurCheck(rows);
      if (seleccion.length) {
        return sendJson(res, 200, {
          etapa: "seleccion",
          rows: seleccion.slice(0, 5).map(r => ({ foto_id: r.foto_id, lugar: lugarById.get(r.foto_id) || "" })),
          progreso
        });
      }
      return sendJson(res, 200, {
        etapa: "manual",
        rows: pendingManual(byId).slice(0, 5).map(c => ({ foto_id: c.foto_id, lugar: c.lugar, sugerencia: suggestion(byId.get(c.foto_id)) })),
        progreso
      });
    }

    if (url.pathname === "/api/decision" && req.method === "POST") {
      const payload = await readBody(req);
      if (!driveById.has(payload.foto_id)) return sendJson(res, 404, { error: "Foto no encontrada" });
      let ok = true;
      const { previous } = updateRow(payload.foto_id, row => {
        ok = applyDecision(row, payload.etapa, payload.decision, payload);
      });
      if (!ok) return sendJson(res, 400, { error: "Decisión inválida" });
      return sendJson(res, 200, { ok: true, previous });
    }

    if (url.pathname === "/api/undo" && req.method === "POST") {
      const payload = await readBody(req);
      const rows = readRows().filter(r => r.foto_id !== payload.foto_id);
      if (payload.previous) rows.push(payload.previous);
      writeRows(rows);
      return sendJson(res, 200, { ok: true });
    }

    // Caras encontradas por el detector (candidatas) y las que la persona ya eligió.
    if (url.pathname.startsWith("/api/caras/")) {
      const fotoId = decodeURIComponent(url.pathname.slice("/api/caras/".length));
      if (!driveById.has(fotoId)) return sendJson(res, 404, { error: "Foto no encontrada" });
      const { faces } = await analyzeFaces(await fetchThumb(fotoId, 1600));
      const row = readRows().find(r => r.foto_id === fotoId);
      const elegidas = row?.caras_verificadas === "SI" ? parseFaces(row.caras) : [];
      return sendJson(res, 200, { detectadas: faces.map(f => f.box), elegidas });
    }

    if (url.pathname.startsWith("/img/") || url.pathname.startsWith("/blur/")) {
      const blurred = url.pathname.startsWith("/blur/");
      const fotoId = decodeURIComponent(url.pathname.slice(blurred ? 6 : 5));
      if (!driveById.has(fotoId)) { res.writeHead(404); return res.end("No encontrada"); }
      let bytes = await fetchThumb(fotoId, blurred ? 1600 : 1200);
      if (blurred) {
        const row = readRows().find(r => r.foto_id === fotoId);
        const caras = row?.caras === "COMPLETA" ? "COMPLETA" : await ensureFaces(fotoId, bytes);
        bytes = await blurImage(bytes, caras);
      }
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" });
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
  const decided = rows.filter(isManual).length;
  console.log("");
  console.log("==============================================");
  console.log(" TPBV - REVISIÓN MANUAL");
  console.log("==============================================");
  console.log(`Decididas: ${decided.toLocaleString("es-MX")} de ${catalog.length.toLocaleString("es-MX")}`);
  console.log(`Abre: http://localhost:${PORT}`);
  console.log("");
});
