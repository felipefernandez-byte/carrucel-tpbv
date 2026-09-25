const { Readable } = require("node:stream");
const { getPhoto } = require("./_lib/catalog");
const {
  fetchDriveMetadata,
  fetchDriveOriginal,
  fetchCredentialedUrl
} = require("./_lib/google");
const { blurImage } = require("./_lib/blur");

const SAFE_ORIGINAL_BYTES = 4_000_000;

function pipeResponse(response, res, fallbackType) {
  res.statusCode = 200;
  res.setHeader(
    "Content-Type",
    response.headers.get("content-type") ||
      fallbackType ||
      "image/jpeg"
  );
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=604800"
  );

  const length = response.headers.get("content-length");
  if (length) {
    res.setHeader("Content-Length", length);
  }

  Readable.fromWeb(response.body).pipe(res);
}

function isProtected(photo) {
  return String(photo.permitir_descarga || "").trim().toUpperCase() === "NO";
}

function sizedThumbnailUrl(link, size) {
  const value = String(link || "");
  if (/=s\d+[^/]*$/i.test(value)) {
    return value.replace(/=s\d+[^/]*$/i, `=w${size}-h${size}`);
  }
  return value + `=w${size}-h${size}`;
}

// Fotos con posibles menores: se difuminan los rostros en el servidor.
// Se parte de la miniatura de Drive porque es la misma imagen (misma
// orientación) sobre la que el modelo local calculó los rostros.
async function sendBlurred(photo, res) {
  const meta = await fetchDriveMetadata(photo.drive_file_id);
  let source = null;

  if (meta.thumbnailLink) {
    const thumb = await fetchCredentialedUrl(
      sizedThumbnailUrl(meta.thumbnailLink, 1600),
      meta._accessToken
    );
    if (thumb.ok) source = Buffer.from(await thumb.arrayBuffer());
  }

  if (!source) {
    const original = await fetchDriveOriginal(photo.drive_file_id);
    if (!original.ok) {
      return res.status(502).json({
        error: "Google Drive no pudo entregar la fotografía"
      });
    }
    source = Buffer.from(await original.arrayBuffer());
  }

  const blurred = await blurImage(source, photo.caras);

  res.statusCode = 200;
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=604800"
  );
  res.setHeader("Content-Length", String(blurred.length));
  return res.end(blurred);
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

    if (isProtected(photo)) {
      return sendBlurred(photo, res);
    }

    const meta = await fetchDriveMetadata(photo.drive_file_id);
    const size = Number(meta.size || 0);

    // Si la foto original cabe con margen en el límite de Vercel,
    // se muestra en calidad original.
    if (size > 0 && size <= SAFE_ORIGINAL_BYTES) {
      const original = await fetchDriveOriginal(photo.drive_file_id);

      if (original.ok && original.body) {
        return pipeResponse(
          original,
          res,
          meta.mimeType || "image/jpeg"
        );
      }
    }

    // Para imágenes grandes usamos la miniatura de Drive.
    // Drive documenta que las miniaturas son mucho más ligeras
    // y el enlace se obtiene autenticado.
    if (meta.thumbnailLink) {
      const thumb = await fetchCredentialedUrl(
        meta.thumbnailLink,
        meta._accessToken
      );

      if (thumb.ok && thumb.body) {
        return pipeResponse(
          thumb,
          res,
          "image/jpeg"
        );
      }
    }

    // Último intento para fotos cuyo tamaño no vino informado.
    const original = await fetchDriveOriginal(photo.drive_file_id);

    if (!original.ok || !original.body) {
      return res.status(502).json({
        error: "Google Drive no pudo entregar la fotografía"
      });
    }

    return pipeResponse(
      original,
      res,
      meta.mimeType || "image/jpeg"
    );

  } catch (error) {
    console.error(error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "No fue posible cargar la fotografía"
      });
    }
  }
};
