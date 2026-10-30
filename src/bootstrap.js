// Process setup that must happen before any other module runs. server.js imports this FIRST:
// ESM evaluates imports before the importing file's own code, so loading .env in server.js's body
// ran after modules like utils/Cloudinary.js had already read process.env (undefined keys).

import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// Relative paths (e.g. express.static("public")) resolve inside backend/ wherever the process starts
process.chdir(backendRoot)

// No-op when there is no .env file (Render/Docker set env vars directly)
dotenv.config({ path: path.join(backendRoot, ".env") })

// Fail fast with a clear message instead of failing later on the first request that needs them
const REQUIRED = [
    "MONGODB_URI",
    "ACCESS_TOKEN_SECRET",
    "REFRESH_TOKEN_SECRET",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET"
]
const missing = REQUIRED.filter((key) => !process.env[key]?.trim())
if (missing.length) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(", ")}`)
    process.exit(1)
}

// Without an expiry, jwt.sign issues tokens that never expire. Not fatal, since older setups
// (docker-compose.yaml, .env.example) didn't define these: fall back to the intended lifetimes.
const EXPIRY_DEFAULTS = { ACCESS_TOKEN_EXPIRY: "1d", REFRESH_TOKEN_EXPIRY: "10d" }
for (const [key, fallback] of Object.entries(EXPIRY_DEFAULTS)) {
    if (!process.env[key]?.trim()) {
        console.warn(`[WARN] ${key} is not set; using ${fallback}`)
        process.env[key] = fallback
    }
}

const generateHint = `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
for (const key of ["ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"]) {
    if (process.env[key].length < 32) {
        console.warn(`[WARN] ${key} is shorter than 32 characters. Use a long random value: ${generateHint}`)
    }
}
if (process.env.ACCESS_TOKEN_SECRET === process.env.REFRESH_TOKEN_SECRET) {
    console.warn("[WARN] ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET are identical; use different values")
}

if (process.env.NODE_ENV === "production" && !(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) {
    console.warn("[WARN] SMTP is not configured: password reset and email change codes cannot be sent")
}
