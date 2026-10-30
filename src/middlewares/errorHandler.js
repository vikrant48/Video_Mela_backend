import multer from "multer"
import { ApiError } from "../utils/ApiError.js"
import { logger } from "../utils/logger.js"

// Maps errors that are meant for the client to { status, message, errors }.
// Returns null for anything else: those are bugs or infrastructure failures whose messages
// (DB hosts, model names, stack details) must not reach the client.
const toClientError = (err) => {
    if (err instanceof ApiError) {
        return { status: err.statusCode, message: err.message, errors: err.errors }
    }
    if (err instanceof multer.MulterError) {
        return { status: err.code === "LIMIT_FILE_SIZE" ? 413 : 400, message: err.message }
    }
    // body-parser and other http-errors mark client errors (malformed JSON, body too large) as safe to show
    if (err?.expose && err.status >= 400 && err.status < 500) {
        return { status: err.status, message: err.message }
    }
    // Malformed ids in params/body (Mongoose casting, or new ObjectId("...") in aggregations)
    if (err?.name === "CastError" || err?.name === "BSONError") {
        return { status: 400, message: "Invalid id or value in request" }
    }
    if (err?.name === "ValidationError") {
        return {
            status: 400,
            message: "Validation failed",
            errors: Object.values(err.errors ?? {}).map((e) => e.message)
        }
    }
    // Unique index violation, e.g. two sign-ups racing for the same username
    if (err?.code === 11000) {
        return { status: 409, message: "A record with this value already exists" }
    }
    return null
}

export const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err)

    const clientError = toClientError(err)
    const status = clientError?.status ?? 500
    const message = clientError?.message ?? "Internal Server Error"

    // Full detail stays in the server log
    if (status >= 500) {
        logger.error(`${req.method} ${req.originalUrl} -> ${status}`, err?.stack || err)
    }

    res.status(status).json({
        statusCode: status,
        success: false,
        message,
        error: message,
        errors: clientError?.errors ?? []
    })
}
