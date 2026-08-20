const QRCode = require("qrcode");
const { getPhoto } = require("./_lib/catalog");

function getPublicOrigin(req) {
  const forwardedProto = String(
    req.headers["x-forwarded-proto"] || "https"
  )
    .split(",")[0]
    .trim();

  const forwardedHost = String(
    req.headers["x-forwarded-host"] ||
    req.headers.host ||
    ""
  )
    .split(",")[0]
    .trim();

  return `${forwardedProto}://${forwardedHost}`;
}

module.exports = async function handler(req, res) {
  try {
    const fotoId = String(
      req.query.foto_id || ""
    ).trim();

    if (!fotoId) {
      return res.status(400).json({
        error: "Falta el identificador de la fotografía"
      });
    }

    const photo = getPhoto(fotoId);

    if (!photo) {
      return res.status(404).json({
        error: "Fotografía no encontrada"
      });
    }

    /*
     * IMPORTANTE:
     *
     * Ya NO usamos:
     *
     * /foto/FOTO-XXXXX
     *
     * porque esa ruta nos estaba generando 404 en Vercel.
     *
     * Ahora el QR apunta directamente al HTML público:
     *
     * /detalle.html?foto=FOTO-XXXXX
     *
     * Esto funciona desde:
     * - datos móviles
     * - otra Wi-Fi
     * - la misma Wi-Fi
     */
    const url =
      `${getPublicOrigin(req)}` +
      `/detalle.html?foto=${encodeURIComponent(photo.foto_id)}`;

    const png = await QRCode.toBuffer(
      url,
      {
        type: "png",
        width: 360,
        margin: 2,
        errorCorrectionLevel: "M"
      }
    );

    res.statusCode = 200;

    res.setHeader(
      "Content-Type",
      "image/png"
    );

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    res.setHeader(
      "Content-Length",
      String(png.length)
    );

    res.end(png);

  } catch (error) {
    console.error(
      "Error generando QR:",
      error
    );

    return res.status(500).json({
      error: "No fue posible generar el QR"
    });
  }
};