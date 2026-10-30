// One-off migration: lowercase existing user emails.
//
// The User schema now lowercases emails on save AND in queries, so any account stored with
// uppercase letters (e.g. "John@Gmail.com") can no longer log in by email or reset its
// password until this runs. Run it as part of the deploy that ships the schema fix.
//
// Usage (from backend/, uses MONGODB_URI from .env):
//   node scripts/lowercase-emails.js           # dry run: reports only, changes nothing
//   node scripts/lowercase-emails.js --apply   # lowercases every non-conflicting account
//
// Accounts whose emails differ only by case (John@x.com and john@x.com) can't both be
// lowercased because email is unique. They are listed and skipped: resolve them by hand
// (e.g. decide which account to keep), then re-run.

import "dotenv/config"
import mongoose from "mongoose"
import { DB_NAME } from "../src/constants.js"

const apply = process.argv.includes("--apply")

// Enough to identify an account without printing full addresses
const mask = (email) => email.replace(/^(.)[^@]*/, "$1***")

await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)

// Native collection: bypasses the schema's lowercase setter so stored values are seen as-is
const users = mongoose.connection.collection("users")

const mixedCase = await users.find(
    { $expr: { $ne: ["$email", { $toLower: "$email" }] } },
    { projection: { email: 1, username: 1 } }
).toArray()

const conflicts = await users.aggregate([
    {
        $group: {
            _id: { $toLower: "$email" },
            accounts: { $push: { _id: "$_id", username: "$username", email: "$email" } },
            count: { $sum: 1 }
        }
    },
    { $match: { count: { $gt: 1 } } }
]).toArray()

const conflictingIds = new Set(conflicts.flatMap((c) => c.accounts.map((a) => String(a._id))))
const toFix = mixedCase.filter((u) => !conflictingIds.has(String(u._id)))

console.log(`Accounts with uppercase letters in email: ${mixedCase.length}`)
console.log(`  can be lowercased:   ${toFix.length}`)
console.log(`  conflicts (skipped): ${mixedCase.length - toFix.length}`)
for (const c of conflicts) {
    const accounts = c.accounts.map((a) => `@${a.username} <${mask(a.email)}>`).join(", ")
    console.log(`  conflict on ${mask(c._id)}: ${accounts}`)
}

if (!apply) {
    console.log(`\nDry run: nothing changed. Re-run with --apply to update ${toFix.length} account(s).`)
} else {
    let updated = 0
    for (const u of toFix) {
        // Match on the old value too, so an email changed meanwhile isn't overwritten
        const result = await users.updateOne(
            { _id: u._id, email: u.email },
            { $set: { email: u.email.toLowerCase() } }
        )
        updated += result.modifiedCount
    }
    console.log(`\nUpdated ${updated} account(s).`)
}

await mongoose.disconnect()
