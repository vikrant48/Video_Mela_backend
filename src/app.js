import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import morgan from "morgan"

const app = express()

// middleware 
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'https://videomela-backend.onrender.com',
            process.env.COOKIE_ORG
        ].filter(Boolean)
        
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true)
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true
}))
app.use(express.json({limit: "16kb"}))
app.use(express.urlencoded({extended:true, limit:"16kb"})) // url encoded
app.use(express.static("public"))

app.use(cookieParser())
app.use(morgan(':method :url :status - :response-time ms'))


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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).json({
        message: "Something went wrong!",
        error: process.env.NODE_ENV === "development" ? err.message : "Internal Server Error"
    })
})


export {app}