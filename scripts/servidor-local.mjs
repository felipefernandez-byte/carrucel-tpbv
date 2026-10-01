// Servidor local para ver el proyecto como quedaría en Vercel, con el
// catálogo y las decisiones actuales. No publica nada.
//
// Uso: node scripts/servidor-local.mjs   (luego abrir http://localhost:3000)

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { loadLocalEnv } from "./_lib/env.mjs";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const require = createRequire(import.meta.url);

loadLocalEnv(ROOT);

// Catálogo al día con las decisiones de data/revision_menores.csv.
const build = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-catalog.mjs")], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const handlers = {
  "/api/data": require("../api/data.js"),
  "/api/image": require("../api/image.js"),
  "/api/download": require("../api/download.js"),
  "/api/qr": require("../api/qr.js")
};

// Mismas reescrituras que vercel.json.
const rewrites = [
  [/^\/$/, "/index.html"],
  [/^\/carrusel\/?$/, "/carrusel.html"],
  [/^\/foto\/[^/]+\/?$/, "/detalle.html"]
];

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".otf": "font/otf",
  ".json": "application/json"
};

// Métodos que las funciones de Vercel esperan en req/res.
function vercelShim(req, res, url) {
  req.query = Object.fromEntries(url.searchParams);
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
    return res;
  };
}

function serveStatic(pathname, res) {
  for (const [pattern, target] of rewrites) {
    if (pattern.test(pathname)) { pathname = target; break; }
  }
  let file = path.join(PUBLIC, decodeURIComponent(pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("No encontrado"); }
  res.writeHead(200, { "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const handler = handlers[url.pathname.replace(/\.js$/, "")];
  try {
    if (handler) {
      vercelShim(req, res, url);
      return await handler(req, res);
    }
    serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) { res.writeHead(500); res.end("Error"); }
  }
}).listen(PORT, () => {
  console.log("");
  console.log("==============================================");
  console.log(" TPBV - DEMO LOCAL (no se publica)");
  console.log("==============================================");
  console.log(`Carrusel:  http://localhost:${PORT}/carrusel`);
  console.log(`Inicio:    http://localhost:${PORT}/`);
  console.log("");
});
