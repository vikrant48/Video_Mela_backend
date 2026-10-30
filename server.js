// Must stay the first import: loads .env and validates config before any other module reads it
import "./src/bootstrap.js"
import mongoose from "mongoose"
import connectDB from "./src/db/db.js"
import { app } from "./src/app.js"
import { logger } from "./src/utils/logger.js"

// Anything that escapes all handlers leaves the process in an unknown state: log it fully and exit,
// so the platform (Render/Docker restart policy) starts a clean instance
process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", reason?.stack || reason)
    process.exit(1)
})
process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", error?.stack || error)
    process.exit(1)
})

const port = Number(process.env.PORT) || 8000

connectDB()
    .then(() => {
        const server = app.listen(port, () => {
            logger.info(`Server is listening on port ${port}`)
        })

        server.on("error", (error) => {
            logger.error(`Server could not start on port ${port}: ${error.message}`)
            process.exit(1)
        })

        // Graceful shutdown: platforms send SIGTERM on deploy/stop. Finish in-flight requests
        // (e.g. uploads), then close the DB connection.
        let shuttingDown = false
        const shutdown = (signal) => {
            if (shuttingDown) return
            shuttingDown = true
            logger.info(`${signal} received: shutting down`)
            server.close(async () => {
                await mongoose.connection.close().catch(() => {})
                process.exit(0)
            })
            server.closeIdleConnections()
            // Don't wait forever on slow or stuck connections
            setTimeout(() => process.exit(1), 10000).unref()
        }
        process.on("SIGTERM", () => shutdown("SIGTERM"))
        process.on("SIGINT", () => shutdown("SIGINT"))
    })
