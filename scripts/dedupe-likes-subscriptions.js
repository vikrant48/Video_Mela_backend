// One-off migration: remove duplicate likes and subscriptions, then build the unique indexes.
//
// The Like and Subscription models now declare unique indexes (one like per user per target, one
// subscription per subscriber/channel pair) so concurrent toggles can't create duplicates.
// MongoDB can't build a unique index while duplicates exist: until this runs, the app still works
// but Mongoose logs an index build error at startup and duplicates stay possible.
//
// Usage (from backend/, uses MONGODB_URI from .env):
//   node scripts/dedupe-likes-subscriptions.js           # dry run: reports only, changes nothing
//   node scripts/dedupe-likes-subscriptions.js --apply   # deletes duplicates, builds the indexes
//
// In each duplicate group the oldest document is kept, so the earliest like/subscription survives.

import "dotenv/config"
import mongoose from "mongoose"
import { DB_NAME } from "../src/constants.js"
import { Like } from "../src/models/like.model.js"
import { Subscription } from "../src/models/subscription.model.js"

const apply = process.argv.includes("--apply")

// Don't let Mongoose build indexes on connect: with duplicates present that would just fail
mongoose.set("autoIndex", false)
await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
const db = mongoose.connection.db

const GROUPS = [
    { label: "video likes", collection: "likes", match: { video: { $exists: true } }, key: { by: "$likedBy", target: "$video" } },
    { label: "comment likes", collection: "likes", match: { comment: { $exists: true } }, key: { by: "$likedBy", target: "$comment" } },
    { label: "tweet likes", collection: "likes", match: { tweet: { $exists: true } }, key: { by: "$likedBy", target: "$tweet" } },
    { label: "subscriptions", collection: "subscriptions", match: {}, key: { by: "$subscriber", target: "$channel" } }
]

let total = 0
for (const group of GROUPS) {
    const duplicates = await db.collection(group.collection).aggregate([
        { $match: group.match },
        { $sort: { createdAt: 1, _id: 1 } },
        { $group: { _id: group.key, ids: { $push: "$_id" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
    ], { allowDiskUse: true }).toArray()

    const extraIds = duplicates.flatMap((d) => d.ids.slice(1))
    total += extraIds.length
    console.log(`${group.label.padEnd(14)} ${duplicates.length} duplicated pair(s), ${extraIds.length} extra document(s)`)

    if (apply && extraIds.length) {
        const result = await db.collection(group.collection).deleteMany({ _id: { $in: extraIds } })
        console.log(`${"".padEnd(14)} deleted ${result.deletedCount}`)
    }
}

if (!apply) {
    console.log(`\nDry run: nothing changed. Re-run with --apply to delete ${total} duplicate(s) and build the indexes.`)
} else {
    await Like.createIndexes()
    await Subscription.createIndexes()
    console.log("\nUnique indexes built on likes and subscriptions.")
}

await mongoose.disconnect()
