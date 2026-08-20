const { Readable } = require("node:stream");
const path = require("node:path");

const { getPhoto } = require("./_lib/catalog");
const {
  fetchDriveMetadata,
  fetchDriveOriginal
} = require("./_lib/google");

const SAFE_ORIGINAL_BYTES = 4_000_000;

function safeName(value, fallback) {
  const base = path.basename(String(value || fallback));
  return base
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "_")
    .slice(0, 180);
}

module.exports = async function handler(req, res) {
  try {
    const fotoId = String(req.query.foto_id || "");
    const photo = getPhoto(fotoId);

    if (!photo) {
      return res.status(404).json({
        error: "Fotografía no encontrada"
      });
    }

    const meta = await fetchDriveMetadata(photo.drive_file_id);
    const size = Number(meta.size || 0);

    // Original pequeño: se descarga directamente.
    if (size > 0 && size <= SAFE_ORIGINAL_BYTES) {
      const response = await fetchDriveOriginal(photo.drive_file_id);

      if (!response.ok || !response.body) {
        throw new Error("Google Drive no pudo entregar la fotografía.");
      }

      const filename = safeName(
        photo.nombre_archivo,
        `${photo.foto_id}.jpg`
      );

      res.statusCode = 200;
      res.setHeader(
        "Content-Type",
        response.headers.get("content-type") ||
          meta.mimeType ||
          "application/octet-stream"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Cache-Control", "private, no-store");

      return Readable.fromWeb(response.body).pipe(res);
    }

    // Para originales grandes Vercel no debe actuar como proxy
    // por su límite de payload. Drive entrega el archivo desde su URL.
    if (meta.webContentLink) {
      res.statusCode = 302;
      res.setHeader("Location", meta.webContentLink);
      res.setHeader("Cache-Control", "private, no-store");
      return res.end();
    }

    if (meta.webViewLink) {
      res.statusCode = 302;
      res.setHeader("Location", meta.webViewLink);
      res.setHeader("Cache-Control", "private, no-store");
      return res.end();
    }

    return res.status(502).json({
      error: "No existe una URL de descarga para esta fotografía"
    });

  } catch (error) {
    console.error(error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "No fue posible descargar la fotografía"
      });
    }
  }
};
