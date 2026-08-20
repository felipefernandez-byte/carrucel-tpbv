const QRCode = require("qrcode");
const { getPhoto } = require("./_lib/catalog");

function getPublicOrigin(req) {
  const forwardedProto = String(
    req.headers["x-forwarded-proto"] || "https"
  ).split(",")[0].trim();

  const forwardedHost = String(
    req.headers["x-forwarded-host"] ||
    req.headers.host ||
    ""
  ).split(",")[0].trim();

  return `${forwardedProto}://${forwardedHost}`;
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

    const url =
      `${getPublicOrigin(req)}/foto/${encodeURIComponent(photo.foto_id)}`;

    const png = await QRCode.toBuffer(url, {
      type: "png",
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M"
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    res.setHeader("Content-Length", String(png.length));
    res.end(png);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "No fue posible generar el QR"
    });
  }
};
