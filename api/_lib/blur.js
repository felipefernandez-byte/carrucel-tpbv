const sharp =
  require("sharp");


/* ==========================================================
   DIFUMINADO DE ROSTROS
   ==========================================================

   La columna "caras" de la revisión de menores guarda:

     ""          -> todavía no se detectan rostros
     "NINGUNA"   -> el modelo no encontró rostros
     "COMPLETA"  -> el responsable pidió difuminar toda la foto
     "x1 y1 x2 y2;x1 y1 x2 y2"
                 -> rostros en coordenadas relativas (0 a 1)

   Regla de seguridad: si no hay rostros utilizables,
   se difumina la fotografía completa.
   ========================================================== */

const MAX_SIZE =
  1600;


/*
 * Margen alrededor de cada rostro para cubrir cabello,
 * orejas y el error de coordenadas del modelo.
 */
const FACE_PADDING =
  0.35;


function parseFaces(value) {

  const text =
    String(value || "")
      .trim();


  if (
    !text ||
    text === "NINGUNA" ||
    text === "COMPLETA"
  ) {

    return [];
  }


  return text
    .split(";")
    .map(part =>
      part
        .trim()
        .split(/\s+/)
        .map(Number)
    )
    .filter(box =>
      box.length === 4 &&
      box.every(n => Number.isFinite(n) && n >= 0 && n <= 1) &&
      box[2] > box[0] &&
      box[3] > box[1]
    );
}


function hasFaceBoxes(value) {

  return parseFaces(value).length > 0;
}


function pixelRegion(box, width, height) {

  const [x1, y1, x2, y2] =
    box;


  const padX =
    (x2 - x1) * FACE_PADDING;


  const padY =
    (y2 - y1) * FACE_PADDING;


  const left =
    Math.max(0, Math.floor((x1 - padX) * width));


  const top =
    Math.max(0, Math.floor((y1 - padY) * height));


  const right =
    Math.min(width, Math.ceil((x2 + padX) * width));


  const bottom =
    Math.min(height, Math.ceil((y2 + padY) * height));


  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}


/*
 * Se reduce la zona a unos cuantos píxeles y se vuelve a
 * ampliar: el resultado es un difuminado que no se puede
 * revertir, a diferencia de un desenfoque suave.
 */
async function obscure(input, region) {

  const blocks =
    6;


  const small =
    await sharp(input)
      .extract(region)
      .resize(
        Math.max(2, Math.min(blocks, region.width)),
        Math.max(2, Math.min(blocks, region.height)),
        { fit: "fill" }
      )
      .toBuffer();


  return sharp(small)
    .resize(
      region.width,
      region.height,
      { fit: "fill" }
    )
    .blur(Math.max(1, Math.min(region.width, region.height) / 10))
    .toBuffer();
}


async function blurImage(input, facesValue) {

  const base =
    await sharp(input)
      .resize({
        width: MAX_SIZE,
        height: MAX_SIZE,
        fit: "inside",
        withoutEnlargement: true
      })
      .jpeg()
      .toBuffer({ resolveWithObject: true });


  const { width, height } =
    base.info;


  const faces =
    parseFaces(facesValue);


  /*
   * Sin rostros detectados o con petición explícita:
   * fotografía completa difuminada.
   */
  if (!faces.length) {

    return sharp(base.data)
      .blur(Math.max(20, Math.round(Math.max(width, height) / 40)))
      .jpeg({ quality: 70 })
      .toBuffer();
  }


  const composites =
    await Promise.all(
      faces.map(async box => {

        const region =
          pixelRegion(box, width, height);


        return {
          input: await obscure(base.data, region),
          left: region.left,
          top: region.top
        };
      })
    );


  return sharp(base.data)
    .composite(composites)
    .jpeg({ quality: 82 })
    .toBuffer();
}


module.exports = {
  parseFaces,
  hasFaceBoxes,
  blurImage
};
