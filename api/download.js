const {
  Readable
} =
  require(
    "node:stream"
  );


const path =
  require(
    "node:path"
  );


const {
  getPhoto
} =
  require(
    "./_lib/catalog"
  );


const {

  fetchDriveMetadata,

  fetchDriveOriginal,

  fetchCredentialedUrl

} =
  require(
    "./_lib/google"
  );


/* ==========================================================
   TAMAÑO DE DESCARGA
   ========================================================== */

/*
 * 1600 px es una buena resolución para:
 *
 * - celulares
 * - WhatsApp
 * - redes sociales
 * - uso digital
 *
 * reduciendo mucho el peso.
 */

const DOWNLOAD_SIZE =
  1600;


/* ==========================================================
   NOMBRE SEGURO
   ========================================================== */

function safeName(
  value,
  fallback
) {

  const base =
    path.basename(

      String(
        value ||
        fallback
      )
    );


  return base

    .replace(

      /[<>:"/\\|?*\x00-\x1F]+/g,

      "_"
    )

    .slice(
      0,
      160
    );
}


/* ==========================================================
   NOMBRE OPTIMIZADO
   ========================================================== */

function optimizedFilename(
  photo,
  contentType
) {

  const original =
    safeName(

      photo.nombre_archivo,

      photo.foto_id
    );


  const base =
    original.replace(

      /\.[^.]+$/,

      ""
    );


  let extension =
    ".jpg";


  if (
    String(contentType)
      .includes(
        "png"
      )
  ) {

    extension =
      ".png";
  }


  else if (

    String(contentType)
      .includes(
        "webp"
      )

  ) {

    extension =
      ".webp";
  }


  return (

    `${base}_optimizada${extension}`
  );
}


/* ==========================================================
   AUMENTAR TAMAÑO DE MINIATURA DE DRIVE
   ========================================================== */

function optimizedThumbnailUrl(
  thumbnailLink
) {

  const value =
    String(
      thumbnailLink ||
      ""
    );


  if (!value) {

    return "";
  }


  /*
   * Los thumbnailLink de Drive suelen terminar en:
   *
   * =s220
   *
   * Pedimos una copia de hasta 1600 px.
   */

  if (
    /=s\d+[^/]*$/i
      .test(
        value
      )
  ) {

    return value.replace(

      /=s\d+[^/]*$/i,

      `=w${DOWNLOAD_SIZE}-h${DOWNLOAD_SIZE}`
    );
  }


  return (

    value +

    `=w${DOWNLOAD_SIZE}-h${DOWNLOAD_SIZE}`
  );
}


/* ==========================================================
   ENVIAR IMAGEN COMO DESCARGA
   ========================================================== */

function sendImage(

  response,

  res,

  photo

) {

  const contentType =

    response.headers.get(
      "content-type"
    )

    ||

    "image/jpeg";


  const filename =
    optimizedFilename(

      photo,

      contentType
    );


  res.statusCode =
    200;


  res.setHeader(

    "Content-Type",

    contentType
  );


  res.setHeader(

    "Content-Disposition",

    `attachment; filename="${filename}"`
  );


  res.setHeader(

    "Cache-Control",

    "private, no-store"
  );


  const length =
    response.headers.get(
      "content-length"
    );


  if (length) {

    res.setHeader(

      "Content-Length",

      length
    );
  }


  return Readable
    .fromWeb(
      response.body
    )
    .pipe(
      res
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
      );


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
       METADATOS
       ====================================================== */

    const meta =
      await fetchDriveMetadata(

        photo.drive_file_id
      );


    /* ======================================================
       VERSIÓN OPTIMIZADA
       ====================================================== */

    if (
      meta.thumbnailLink
    ) {

      /*
       * Primero intentamos una versión
       * de aproximadamente 1600 px.
       */

      const optimizedUrl =
        optimizedThumbnailUrl(

          meta.thumbnailLink
        );


      const optimized =
        await fetchCredentialedUrl(

          optimizedUrl,

          meta._accessToken
        );


      if (

        optimized.ok

        &&

        optimized.body

      ) {

        return sendImage(

          optimized,

          res,

          photo
        );
      }


      /*
       * Si Drive no acepta el tamaño personalizado,
       * usamos su thumbnail normal.
       */

      const thumbnail =
        await fetchCredentialedUrl(

          meta.thumbnailLink,

          meta._accessToken
        );


      if (

        thumbnail.ok

        &&

        thumbnail.body

      ) {

        return sendImage(

          thumbnail,

          res,

          photo
        );
      }
    }


    /* ======================================================
       FALLBACK
       ====================================================== */

    /*
     * En caso de que Drive no tenga miniatura,
     * utilizamos el original.
     */

    const original =
      await fetchDriveOriginal(

        photo.drive_file_id
      );


    if (

      !original.ok

      ||

      !original.body

    ) {

      throw new Error(

        "Google Drive no pudo entregar la fotografía."
      );
    }


    return sendImage(

      original,

      res,

      photo
    );


  } catch (error) {

    console.error(
      error
    );


    if (
      !res.headersSent
    ) {

      return res

        .status(
          500
        )

        .json({

          error:

            "No fue posible descargar la fotografía"
        });
    }
  }
};