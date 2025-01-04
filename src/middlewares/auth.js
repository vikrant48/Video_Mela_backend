import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import jwt from "jsonwebtoken"
import { User } from "../models/user.model.js"

export const verifyJWT = asyncHandler(async (req, _, next) => {
    try {
        console.log("Authorization Header:", req.header("Authorization"))

        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")
        console.log("Token:", token)

        if (!token || typeof token !== "string") {
            throw new ApiError(401, "Invalid or missing token or Not in string")
        }
        
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
        console.log("Decoded Token:", decodedToken)

        if (!decodedToken || !decodedToken._id) {
            throw new ApiError(401, "Invalid or missing decoded token");
        }

        const user = await User.findById(decodedToken._id).select("-password -refreshToken");
        if (!user) {
            throw new ApiError(401, "Invalid Access Token");
        }

        req.user = user;
        next()
    } catch (error) {
        throw new ApiError(401, `JWT failed due to ${error.message}`)
    }

})