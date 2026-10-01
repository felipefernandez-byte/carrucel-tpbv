// Detección de rostros y estimación de edad, 100% local.
//
// - Rostros: YuNet (OpenCV Zoo, licencia MIT), entrada fija 640x640.
//   Para no perder caras pequeñas en fotos grupales, además de la foto
//   completa se analizan 4 secciones que se traslapan.
// - Edad: ViT entrenado con FairFace (dima806/fairface_age_image_detection,
//   licencia Apache 2.0). FairFace está balanceado por grupo étnico, incluidas
//   personas latinas. Rangos: 0-2, 3-9, 10-19, 20-29, 30-39, 40-49, 50-59, 60-69, 70+.
//   (El modelo anterior, age_googlenet, marcaba muchos adultos como niños.)
//
// No identifica personas: solo ubica rostros y estima un rango de edad.

import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ort = require("onnxruntime-node");
const sharp = require("sharp");

const MODELS_DIR = path.join(process.cwd(), "models");

export const MODEL_FILES = {
  yunet: {
    file: "face_detection_yunet_2023mar.onnx",
    url: "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
  },
  age: {
    file: "fairface_age_quantized.onnx",
    url: "https://huggingface.co/onnx-community/fairface_age_image_detection-ONNX/resolve/main/onnx/model_quantized.onnx",
    sha256: "42633bffee3cb91118f90cc97311270a4f94fa9f8eb7023e277ce045b2b91223"
  }
};

export const AGE_BUCKETS = ["0-2", "3-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"];

const YUNET_SIZE = 640;
const SCORE_THRESHOLD = 0.6;
const NMS_IOU = 0.3;
const AGE_MARGINS = [1.4, 2.2];

let sessions = null;

async function ensureModel({ file, url, sha256 }) {
  const target = path.join(MODELS_DIR, file);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    console.log(`Descargando modelo ${file}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`No se pudo descargar ${file} (${response.status})`);
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  }
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(fs.readFileSync(target)).digest("hex");
  if (hash !== sha256) {
    fs.unlinkSync(target);
    throw new Error(`El modelo ${file} está dañado; se borró. Vuelve a ejecutar.`);
  }
  return target;
}

export async function loadModels() {
  if (sessions) return sessions;
  const options = { intraOpNumThreads: 2 };
  sessions = {
    yunet: await ort.InferenceSession.create(await ensureModel(MODEL_FILES.yunet), options),
    age: await ort.InferenceSession.create(await ensureModel(MODEL_FILES.age), options)
  };
  return sessions;
}

// ---------------------------------------------------------------------------
// YuNet
// ---------------------------------------------------------------------------

// Recorta una región de la imagen (RGB crudo), la escala para caber en 640x640
// (relleno negro a la derecha/abajo) y la convierte a tensor BGR NCHW 0-255.
async function yunetInput(raw, info, region) {
  const scale = Math.min(YUNET_SIZE / region.width, YUNET_SIZE / region.height);
  const w = Math.max(1, Math.round(region.width * scale));
  const h = Math.max(1, Math.round(region.height * scale));

  const pixels = await sharp(raw, { raw: info })
    .extract(region)
    .resize(w, h, { fit: "fill" })
    .extend({ right: YUNET_SIZE - w, bottom: YUNET_SIZE - h, background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .raw()
    .toBuffer();

  const plane = YUNET_SIZE * YUNET_SIZE;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    data[i] = pixels[i * 3 + 2];             // B
    data[plane + i] = pixels[i * 3 + 1];     // G
    data[2 * plane + i] = pixels[i * 3];     // R
  }
  return { tensor: new ort.Tensor("float32", data, [1, 3, YUNET_SIZE, YUNET_SIZE]), scale };
}

// Decodificación de YuNet 2023mar (igual que cv::FaceDetectorYN).
function decodeYunet(out, scale, region) {
  const faces = [];
  for (const stride of [8, 16, 32]) {
    const cls = out[`cls_${stride}`].data;
    const obj = out[`obj_${stride}`].data;
    const bbox = out[`bbox_${stride}`].data;
    const cols = YUNET_SIZE / stride;
    const rows = YUNET_SIZE / stride;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const clsScore = Math.min(1, Math.max(0, cls[idx]));
        const objScore = Math.min(1, Math.max(0, obj[idx]));
        const score = Math.sqrt(clsScore * objScore);
        if (score < SCORE_THRESHOLD) continue;

        const cx = (c + bbox[idx * 4]) * stride;
        const cy = (r + bbox[idx * 4 + 1]) * stride;
        const w = Math.exp(bbox[idx * 4 + 2]) * stride;
        const h = Math.exp(bbox[idx * 4 + 3]) * stride;

        faces.push({
          x1: region.left + (cx - w / 2) / scale,
          y1: region.top + (cy - h / 2) / scale,
          x2: region.left + (cx + w / 2) / scale,
          y2: region.top + (cy + h / 2) / scale,
          score
        });
      }
    }
  }
  return faces;
}

function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = ix * iy;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return union > 0 ? inter / union : 0;
}

function nms(faces) {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const face of sorted) {
    if (kept.every(k => iou(k, face) < NMS_IOU)) kept.push(face);
  }
  return kept;
}

// Foto completa + 4 secciones traslapadas (cuando la foto es grande).
function regionsFor(width, height) {
  const regions = [{ left: 0, top: 0, width, height }];
  if (Math.max(width, height) > YUNET_SIZE * 1.2) {
    const tw = Math.round(width * 0.6);
    const th = Math.round(height * 0.6);
    for (const left of [0, width - tw]) {
      for (const top of [0, height - th]) {
        regions.push({ left, top, width: tw, height: th });
      }
    }
  }
  return regions;
}

// ---------------------------------------------------------------------------
// Edad
// ---------------------------------------------------------------------------

async function estimateAge(raw, info, face, margin) {
  // Recorte cuadrado con margen, parecido a los recortes de FairFace.
  const size = Math.max(face.x2 - face.x1, face.y2 - face.y1) * margin;
  const cx = (face.x1 + face.x2) / 2;
  const cy = (face.y1 + face.y2) / 2;
  const left = Math.max(0, Math.round(cx - size / 2));
  const top = Math.max(0, Math.round(cy - size / 2));
  const width = Math.max(1, Math.min(info.width - left, Math.round(size)));
  const height = Math.max(1, Math.min(info.height - top, Math.round(size)));

  const pixels = await sharp(raw, { raw: info })
    .extract({ left, top, width, height })
    .resize(224, 224, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  // ViTFeatureExtractor: RGB, (x / 255 - 0.5) / 0.5
  const plane = 224 * 224;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    data[i] = pixels[i * 3] / 127.5 - 1;
    data[plane + i] = pixels[i * 3 + 1] / 127.5 - 1;
    data[2 * plane + i] = pixels[i * 3 + 2] / 127.5 - 1;
  }

  const { age } = await loadModels();
  const out = await age.run({ pixel_values: new ort.Tensor("float32", data, [1, 3, 224, 224]) });
  const logits = Array.from(out.logits.data);
  const max = Math.max(...logits);
  const exps = logits.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Analiza una imagen y devuelve los rostros encontrados, cada uno con
 * coordenadas relativas (0-1), tamaño en píxeles y probabilidad de ser menor.
 */
export async function analyzeFaces(imageBuffer) {
  const { yunet } = await loadModels();

  const { data: raw, info } = await sharp(imageBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rawInfo = { width: info.width, height: info.height, channels: info.channels };

  let faces = [];
  for (const region of regionsFor(info.width, info.height)) {
    const { tensor, scale } = await yunetInput(raw, rawInfo, region);
    const out = await yunet.run({ input: tensor });
    faces.push(...decodeYunet(out, scale, region));
  }

  faces = nms(faces)
    .map(f => ({
      ...f,
      x1: Math.max(0, f.x1),
      y1: Math.max(0, f.y1),
      x2: Math.min(info.width, f.x2),
      y2: Math.min(info.height, f.y2)
    }))
    .filter(f => f.x2 - f.x1 >= 4 && f.y2 - f.y1 >= 4);

  const result = [];
  for (const face of faces) {
    // La estimación cambia bastante según el recorte, sobre todo en caras
    // pequeñas. Se usan dos recortes y se queda el resultado más joven.
    let pMinor = -1;
    let probs = null;
    for (const margin of AGE_MARGINS) {
      const p = await estimateAge(raw, rawInfo, face, margin);
      // 0-2 y 3-9 son menores; 10-19 es mayormente de menores (10 a 17).
      const pm = p[0] + p[1] + 0.8 * p[2];
      if (pm > pMinor) {
        pMinor = pm;
        probs = p;
      }
    }
    const best = probs.indexOf(Math.max(...probs));
    result.push({
      box: [face.x1 / info.width, face.y1 / info.height, face.x2 / info.width, face.y2 / info.height],
      sizePx: Math.round(Math.min(face.x2 - face.x1, face.y2 - face.y1)),
      score: face.score,
      pMinor,
      edad: AGE_BUCKETS[best]
    });
  }

  return { width: info.width, height: info.height, faces: result };
}
