const {

  getPhoto,

  getCarouselWindow,

  getPhotosBy,

  publicPhoto

} =
  require(
    "./_lib/catalog"
  );


module.exports =
async function handler(
  req,
  res
) {

  try {

    /* ======================================================
       CACHE
       ====================================================== */

    res.setHeader(

      "Cache-Control",

      "public, s-maxage=30, stale-while-revalidate=300"
    );


    const action =
      String(
        req.query.action ||
        ""
      );


    /* ======================================================
       UNA FOTO
       ====================================================== */

    if (
      action ===
      "foto"
    ) {

      const photo =
        getPhoto(
          String(
            req.query.id ||
            ""
          )
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


      return res

        .status(
          200
        )

        .json(
          publicPhoto(
            photo
          )
        );
    }


    /* ======================================================
       CARRUSEL
       ====================================================== */

    if (
      action ===
      "carrusel-window"
    ) {

      return res

        .status(
          200
        )

        .json(

          (() => {

            const win =
              getCarouselWindow(
                req.query.index
              );


            return {

              ...win,

              prev:
                publicPhoto(
                  win.prev
                ),

              current:
                publicPhoto(
                  win.current
                ),

              next:
                publicPhoto(
                  win.next
                )
            };
          })()
        );
    }


    /* ======================================================
       GALERÍA
       ====================================================== */

    if (
      action ===
      "fotos"
    ) {

      return res

        .status(
          200
        )

        .json(

          (result => ({

            ...result,

            items:
              result.items.map(
                publicPhoto
              )
          }))(getPhotosBy({

            localidad:

              req.query.localidad,


            municipio:

              req.query.municipio,


            evento:

              req.query.evento,


            limit:

              req.query.limit,


            offset:

              req.query.offset
          }))
        );
    }


    /* ======================================================
       ACCIÓN INVÁLIDA
       ====================================================== */

    return res

      .status(
        400
      )

      .json({

        error:

          "Acción inválida"
      });


  } catch (error) {

    console.error(
      error
    );


    return res

      .status(
        500
      )

      .json({

        error:

          "No fue posible consultar el catálogo"
      });
  }
};