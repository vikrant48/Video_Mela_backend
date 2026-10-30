// One-off migration: switch stored Cloudinary media URLs from http:// to https://.
//
// Videos used to be saved with Cloudinary's plain "url" (http) instead of "secure_url". New uploads
// now store https. On the https site, browsers block or auto-upgrade http media (mixed content);
// the frontend CSP upgrades them too, but the stored data should simply be correct.
//
// Usage (from backend/, uses MONGODB_URI from .env):
//   node scripts/https-media-urls.js           # dry run: reports only, changes nothing
//   node scripts/https-media-urls.js --apply   # rewrites the URLs
//
// Only res.cloudinary.com URLs are rewritten (Cloudinary serves the same asset over https).

import "dotenv/config"
import mongoose from "mongoose"
import { DB_NAME } from "../src/constants.js"

const apply = process.argv.includes("--apply")

const HTTP_PREFIX = "http://res.cloudinary.com/"
const HTTPS_PREFIX = "https://res.cloudinary.com/"
const isHttp = /^http:\/\/res\.cloudinary\.com\//

// Per collection: the URL fields that may hold http links
const TARGETS = [
    { collection: "videos", fields: ["videoFile.url", "thumbnail.url"] },
    { collection: "users", fields: ["avatar.url", "coverImage.url"] }
]

await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
const db = mongoose.connection.db

let total = 0
for (const { collection, fields } of TARGETS) {
    for (const field of fields) {
        const filter = { [field]: isHttp }
        const count = await db.collection(collection).countDocuments(filter)
        total += count
        console.log(`${`${collection}.${field}`.padEnd(22)} ${count} http URL(s)`)

        if (apply && count) {
            const result = await db.collection(collection).updateMany(filter, [
                { $set: { [field]: { $replaceOne: { input: `$${field}`, find: HTTP_PREFIX, replacement: HTTPS_PREFIX } } } }
            ])
            console.log(`${"".padEnd(22)} updated ${result.modifiedCount}`)
        }
    }
}

if (!apply) {
    console.log(`\nDry run: nothing changed. Re-run with --apply to rewrite ${total} URL(s).`)
}

await mongoose.disconnect()
