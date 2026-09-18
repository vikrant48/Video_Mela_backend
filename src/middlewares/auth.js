// import { asyncHandler } from "../utils/asyncHandler.js"
// import { ApiError } from "../utils/ApiError.js"
// import jwt from "jsonwebtoken"
// import { User } from "../models/user.model.js"

// export const verifyJWT = asyncHandler(async (req, _, next) => {
//     try {
//         console.log("Authorization Header:", req.header("Authorization"))

//         const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")
//         console.log("Token:", token)

//         if (!token || typeof token !== "string") {
//             throw new ApiError(401, "Invalid or missing token or Not in string")
//         }

//         const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
//         console.log("Decoded Token:", decodedToken)

//         if (!decodedToken || !decodedToken._id) {
//             throw new ApiError(401, "Invalid or missing decoded token");
//         }

//         const user = await User.findById(decodedToken._id).select("-password -refreshToken");
//         if (!user) {
//             throw new ApiError(401, "Invalid Access Token");
//         }

//         req.user = user;
//         next()
//     } catch (error) {
//         throw new ApiError(401, `JWT failed due to ${error.message}`)
//     }

// })

import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken"
import { User } from "../models/user.model.js";
import { logger } from "../utils/logger.js";

export const verifyJWT = asyncHandler(async (req, _, next) => {
    try {
        const cookieToken = req.cookies?.accessToken;
        const headerToken = req.header("Authorization")?.replace("Bearer ", "");
        const token = cookieToken || headerToken;
        const tokenSource = cookieToken ? "Cookie" : (headerToken ? "Authorization Header" : "None");

        if (!token || typeof token !== "string") {
            logger.warn(`verifyJWT 401 Unauthorized: Token is missing or invalid`);
            throw new ApiError(401, "Unauthorized request: Token is missing or invalid");
        }

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)

        const user = await User.findById(decodedToken?._id).select("-password -refreshToken")

        if (!user) {
            logger.warn(`verifyJWT 401 Unauthorized: User ID ${decodedToken?._id} not found in DB`);
            throw new ApiError(401, "Invalid Access Token: User not found")
        }

        logger.info(`verifyJWT User authenticated: @${user.username} (ID: ${user._id}) [Source: ${tokenSource}]`);
        req.user = user;
        next()
    } catch (error) {
        logger.warn(`verifyJWT Authentication failed: ${error?.message || "Invalid access token"}`);
        throw new ApiError(401, error?.message || "Invalid access token")
    }
})