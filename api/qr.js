const QRCode =
  require(
    "qrcode"
  );


const {

  getPhoto

} =
  require(
    "./_lib/catalog"
  );


/* ==========================================================
   DOMINIO PÚBLICO DE VERCEL
   ========================================================== */

function getPublicOrigin(
  req
) {

  const proto =
    String(

      req.headers[
        "x-forwarded-proto"
      ]
      ||
      "https"
    )

      .split(
        ","
      )[0]

      .trim();


  const host =
    String(

      req.headers[
        "x-forwarded-host"
      ]

      ||

      req.headers.host

      ||

      ""
    )

      .split(
        ","
      )[0]

      .trim();


  return (

    `${proto}://` +
    `${host}`
  );
}


/* ==========================================================
   API
   ========================================================== */

module.exports =
async function handler(
  req,
  res
) {

  try {

    const fotoId =
      String(
        req.query.foto_id ||
        ""
      )
      .trim();


    /* ======================================================
       VALIDAR ID
       ====================================================== */

    if (!fotoId) {

      return res

        .status(
          400
        )

        .json({

          error:

            "Falta el identificador de la fotografía"
        });
    }


    /* ======================================================
       BUSCAR FOTO
       ====================================================== */

    const photo =
      getPhoto(
        fotoId
      );


    if (!photo) {

      return res

        .status(
          404
        )

        .json({

          error:

            "Fotografía no encontrada"
        });
    }


    /* ======================================================
       URL DEL QR
       ====================================================== */

    const url =

      `${getPublicOrigin(req)}` +

      `/detalle.html?foto=` +

      encodeURIComponent(
        photo.foto_id
      );


    /* ======================================================
       GENERAR QR
       ====================================================== */

    const png =
      await QRCode
        .toBuffer(

          url,

          {

            type:

              "png",


            width:

              360,


            margin:

              2,


            errorCorrectionLevel:

              "M"
          }
        );


    /* ======================================================
       RESPUESTA
       ====================================================== */

    res.statusCode =
      200;


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

      String(
        png.length
      )
    );


    res.end(
      png
    );


  } catch (error) {

    console.error(

      "Error generando QR:",

      error
    );


    return res

      .status(
        500
      )

      .json({

        error:

          "No fue posible generar el QR"
      });
  }
};