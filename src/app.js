import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import morgan from "morgan"
import { logger } from "./utils/logger.js"
import { apiLimiter } from "./middlewares/rateLimit.js"
import { cleanupTempFiles } from "./middlewares/multer.js"
import { errorHandler } from "./middlewares/errorHandler.js"
import { ApiError } from "./utils/ApiError.js"
import helmet from "helmet"

const app = express()

// How many proxies sit in front of this app; req.ip (used by the rate limiters) is read from
// X-Forwarded-For that many hops back.
//   1 = clients call Render directly (Render's load balancer only)
//   2 = clients go through the Vercel /api/v1 rewrite (Vercel sets X-Forwarded-For to the real
//       client IP, then Render appends Vercel's IP). With 1 here, every user would share Vercel's IP.
// The client IP is logged on every request (see morgan below) so the setting can be verified.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1))

// Security headers (HSTS, nosniff, frame denial, no X-Powered-By, ...). First, so even error
// responses get them. This server only returns JSON, so its CSP allows nothing to load or frame it.
// The frontend's own CSP is set in frontend/vercel.json.
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"]
        }
    }
}))

// middleware 
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const cleanOrigin = origin.replace(/\/$/, "");

        const allowedOrigins = [
            process.env.LOCAL_FRONTEND_URL,
            process.env.COOKIE_ORG,
            process.env.FRONTEND_URL,
            "https://video-mela.vercel.app"
        ]
            .filter(Boolean)
            .map(url => url.replace(/\/$/, ""));

        // Match exact allowed origins
        if (allowedOrigins.includes(cleanOrigin)) {
            callback(null, true);
        } else {
            logger.warn('CORS blocked origin:', origin);
            // Must stay an error (not callback(null, false)): rejecting here, before any route runs,
            // is what stops cross-site form POSTs from acting with the user's cookies.
            callback(new ApiError(403, 'Not allowed by CORS'));
        }
    },
    credentials: true
}))
app.use(express.json({ limit: "16kb" }))
app.use(express.urlencoded({ extended: true, limit: "16kb" })) // url encoded
app.use(express.static("public"))

app.use(cookieParser())
// One line per request (the only request log). :remote-addr is req.ip, i.e. the client IP as
// resolved via TRUST_PROXY_HOPS
app.use(morgan(':remote-addr :method :url :status - :response-time ms'))


// import routes
import userRouter from "./routes/user.route.js"
import commentRouter from "./routes/comment.route.js"
import likeRouter from "./routes/like.route.js"
import subscriptionRouter from "./routes/subscription.route.js"
import tweetRouter from "./routes/xtweet.route.js"
import videoRouter from "./routes/video.route.js"
import healthcheckRouter from "./routes/healthcheck.route.js"
import playlistRouter from "./routes/playlist.route.js"
import dashboardRouter from "./routes/dashboard.route.js"


// routes declearation
// API responses are per-user (auth cookies, profile data): no CDN or browser cache may store them.
// Matters because the frontend reaches this API through Vercel's rewrite proxy, which can cache
// upstream responses.
app.use("/api/v1", (req, res, next) => {
    res.set("Cache-Control", "no-store")
    next()
})
app.use("/api/v1", apiLimiter)
app.use("/api/v1", cleanupTempFiles)
app.use("/api/v1/users", userRouter)
app.use("/api/v1/comment", commentRouter)
app.use("/api/v1/likes", likeRouter)
app.use("/api/v1/subscriptions", subscriptionRouter)
app.use("/api/v1/tweet", tweetRouter)
app.use("/api/v1/video", videoRouter)
app.use("/api/v1/healthcheck", healthcheckRouter)
app.use("/api/v1/playlist", playlistRouter)
app.use("/api/v1/dashboard", dashboardRouter)

// Root route
app.get("/", (req, res) => {
    res.json({
        message: "VideoMela Backend API is running!",
        status: "success",
        endpoints: {
            healthcheck: "/api/v1/healthcheck",
            users: "/api/v1/users",
            videos: "/api/v1/video",
            comments: "/api/v1/comment",
            likes: "/api/v1/likes",
            subscriptions: "/api/v1/subscriptions",
            tweets: "/api/v1/tweet",
            playlists: "/api/v1/playlist",
            dashboard: "/api/v1/dashboard"
        }
    })
})

// Unknown routes get the same JSON error shape as everything else
app.use((req, res, next) => next(new ApiError(404, "Route not found")))

// Error handling middleware: sends only client-safe messages, logs the rest
app.use(errorHandler)


export { app }