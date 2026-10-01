import fs from "node:fs";
import path from "node:path";

export function loadLocalEnv(root = process.cwd()) {
  const candidates = [
    path.join(root, ".env.local"),
    path.join(root, ".env"),
    path.join(root, ".vercel", ".env.development.local")
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      let name = line.slice(0, idx).trim().replace(/^\uFEFF/, "");
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (name && process.env[name] === undefined) process.env[name] = value;
    }
  }
}
