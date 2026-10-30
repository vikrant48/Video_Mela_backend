import { rateLimit } from "express-rate-limit"

// In-memory store: limits are per process. Use a shared store (e.g. Redis) if you run multiple instances.
// Client IPs come from X-Forwarded-For via app.set("trust proxy", 1) in app.js.

const createLimiter = ({ windowMs, limit, message, ...options }) => rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Same shape as asyncHandler / ApiError responses so the frontend shows the message
    message: {
        statusCode: 429,
        success: false,
        message,
        error: message
    },
    ...options
})

// Broad cap for the whole API
export const apiLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    message: "Too many requests, please try again later."
})

// Only failed logins count, so normal users are never locked out by their own sessions
export const loginLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    message: "Too many failed login attempts. Please try again in 15 minutes."
})

// Per account, independent of IP: guessing one account's password can't be spread across many IPs
// (or spoofed ones, if requests bypass the Vercel proxy). Only failed attempts count. Non-string
// identifiers are skipped here; the controller rejects them.
export const loginAccountLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    skip: (req) => typeof (req.body?.email ?? req.body?.username) !== "string",
    keyGenerator: (req) => `account:${(req.body.email ?? req.body.username).trim().toLowerCase()}`,
    message: "Too many failed login attempts for this account. Please try again in 15 minutes."
})

// Runs before multer so rejected requests are never buffered into memory
export const registerLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    message: "Too many accounts created from this IP. Please try again later."
})

// Each request sends an email
export const forgotPasswordLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    message: "Too many password reset requests. Please try again later."
})

// Per user, not IP (mount after verifyJWT): each upload can be up to 100 MB of temp disk and bandwidth
export const videoUploadLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => req.user._id.toString(),
    message: "Video upload limit reached (10 per hour). Please try again later."
})

// Per user (mount after verifyJWT). Each email change sends a code to an address the user chooses,
// so cap it; name-only updates (same or no email) aren't counted.
export const emailChangeLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    keyGenerator: (req) => req.user._id.toString(),
    skip: (req) => typeof req.body?.email !== "string" ||
        req.body.email.trim().toLowerCase() === req.user.email,
    message: "Too many email change requests. Please try again later."
})

// Covers verify-otp, reset-password and verify-email-change
export const otpLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: "Too many attempts. Please try again in 15 minutes."
})
