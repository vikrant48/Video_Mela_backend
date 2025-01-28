import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import morgan from "morgan"

const app = express()

// middleware 
app.use(cors({
    origin: process.env.COOKIE_ORG || "http://localhost:5173",
    Credentials:true
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



export {app}