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

// Errors jsonwebtoken throws for a bad/expired token (as opposed to infrastructure failures)
export const JWT_ERRORS = ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"]

export const verifyJWT = asyncHandler(async (req, _, next) => {
    try {
        const cookieToken = req.cookies?.accessToken;
        const headerToken = req.header("Authorization")?.replace("Bearer ", "");
        const token = cookieToken || headerToken;

        // Not logged: every anonymous visitor hits this (e.g. the app's startup session check)
        if (!token || typeof token !== "string") {
            throw new ApiError(401, "Unauthorized request: Token is missing or invalid");
        }

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)

        // Only access tokens may authenticate. Tokens issued before the typ claim existed have no typ;
        // legacy password-reset tokens (signed with this secret before) are recognised by their purpose claim.
        // TODO: once pre-typ access tokens have expired (ACCESS_TOKEN_EXPIRY), require typ === "access".
        if ((decodedToken.typ && decodedToken.typ !== "access") || decodedToken.purpose) {
            logger.warn(`verifyJWT 401 Unauthorized: wrong token type`);
            throw new ApiError(401, "Unauthorized request: invalid token type")
        }

        const user = await User.findById(decodedToken?._id).select("-password -refreshToken")

        if (!user) {
            logger.warn(`verifyJWT 401 Unauthorized: User ID ${decodedToken?._id} not found in DB`);
            throw new ApiError(401, "Invalid Access Token: User not found")
        }

        // Tokens issued before the last password change/reset are revoked.
        // iat has 1s resolution, so compare in whole seconds to keep tokens issued right after the change.
        if (user.passwordChangedAt && decodedToken.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
            logger.warn(`verifyJWT 401 Unauthorized: token issued before password change for @${user.username}`);
            throw new ApiError(401, "Session expired: password was changed. Please log in again.")
        }

        // No per-request success log: it wrote every user's username/ID on every call
        req.user = user;
        next()
    } catch (error) {
        if (error instanceof ApiError) throw error
        // Token problems (expired, bad signature, malformed) are the client's: 401.
        // Anything else (e.g. the database is down) is a server fault: rethrow so it becomes a
        // generic 500, instead of a 401 that leaks the error text and logs the user out.
        if (JWT_ERRORS.includes(error?.name)) {
            logger.warn(`verifyJWT Authentication failed: ${error.message}`);
            throw new ApiError(401, error.message)
        }
        throw error
    }
})