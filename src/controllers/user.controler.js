import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { visibleTo } from "../models/video.model.js"
import { uploadonCloudinary, deleteonCloudinary } from "../utils/Cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { logger } from "../utils/logger.js"
import { sendEmail } from "../utils/sendEmail.js"
import { JWT_ERRORS } from "../middlewares/auth.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"
import crypto from "crypto"
import bcrypt from "bcrypt"

const MAX_OTP_ATTEMPTS = 5;

// Purpose-specific keys derived from ACCESS_TOKEN_SECRET, so reset tokens can never verify as
// access tokens. Computed per call because env may be loaded after this module is imported.
const deriveSecret = (purpose) =>
    crypto.createHmac("sha256", process.env.ACCESS_TOKEN_SECRET).update(purpose).digest("hex");

// OTPs are stored as an HMAC so a database leak doesn't expose live codes.
// purpose keeps password-reset and email-change codes from being interchangeable.
const hashOTP = (otp, purpose = "password-reset-otp") =>
    crypto.createHmac("sha256", deriveSecret(purpose)).update(otp).digest("hex");

const isOTPMatch = (otp, storedHash, purpose) => {
    const candidate = Buffer.from(hashOTP(otp, purpose));
    const stored = Buffer.from(storedHash);
    return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

// Password policy for every place a password is set. Returns an error message, or null if valid.
// bcrypt ignores everything past 72 bytes, so longer passwords would be silently truncated.
const passwordError = (password) => {
    if (typeof password !== "string" || password.length < 8) {
        return "Password must be at least 8 characters long"
    }
    if (Buffer.byteLength(password, "utf8") > 72) {
        return "Password must be at most 72 bytes long"
    }
    return null
}

// For user-controlled text placed into HTML emails
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
))

// Login compares against this when the account doesn't exist, so the response takes the same
// time either way and timing doesn't reveal which usernames/emails are registered
let dummyHash
const dummyPasswordHash = async () => (dummyHash ??= await bcrypt.hash("timing-equalizer", 10))

// Auth cookie flags. Functions, not constants: env may be loaded after this module is imported.
const authCookieBase = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
})

// Each cookie lives exactly as long as its token (was a fixed 24h, which cut the 10-day
// refresh token short and forced a re-login every day)
const cookieFor = (token) => ({
    ...authCookieBase(),
    maxAge: Math.max(0, jwt.decode(token).exp * 1000 - Date.now())
})

const setAuthCookies = (res, accessToken, refreshToken) => res
    .cookie("accessToken", accessToken, cookieFor(accessToken))
    .cookie("refreshToken", refreshToken, cookieFor(refreshToken))

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }


    } catch (error) {
        throw new ApiError(500, "access and refresh token generation failed")

    }

}

const registerUser = asyncHandler(async (req, res) => {
    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res


    const { fullName, email, username, password } = req.body
    //console.log("email: ", email);

    // Must be non-empty strings: objects like {"$gt": ""} would act as query operators below
    if (
        [fullName, email, username, password].some((field) => typeof field !== "string" || field.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }

    const passwordProblem = passwordError(password)
    if (passwordProblem) {
        throw new ApiError(400, passwordProblem)
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }
    //console.log(req.files);

    if (!req.files) {
        throw new ApiError(400, "Please upload an images using multipart/form-data.")
    }

    // Check for avatar file (required)
    const avatarFile = req.files?.avatar?.[0];
    const coverImageFile = req.files?.coverImage?.[0];

    if (!avatarFile) {
        throw new ApiError(400, "Avatar file is required. Please upload an avatar image using multipart/form-data.")
    }

    // Upload avatar to Cloudinary (required) - checked before uploading the cover, so a failed
    // avatar doesn't leave an orphaned cover image behind
    const avatar = await uploadonCloudinary(avatarFile.path, {
        folder: 'avatars',
        transformation: [{ width: 300, height: 300, crop: 'fill' }]
    })

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }

    // Upload cover image to Cloudinary (optional)
    let coverImage = null;
    if (coverImageFile) {
        coverImage = await uploadonCloudinary(coverImageFile.path, {
            folder: 'cover-images',
            transformation: [{ width: 800, height: 400, crop: 'fill' }]
        })
    }

    let user
    try {
        user = await User.create({
            fullName,
            avatar: {
                public_id: avatar.public_id,
                url: avatar.secure_url
            },
            coverImage: coverImage ? {
                public_id: coverImage.public_id,
                url: coverImage.secure_url
            } : undefined,
            email,
            password,
            username: username.toLowerCase()
        })
    } catch (error) {
        // e.g. the same username/email registered concurrently: remove this attempt's uploads
        await deleteonCloudinary(avatar.public_id)
        if (coverImage) await deleteonCloudinary(coverImage.public_id)
        throw error
    }

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(201, createdUser, "User registered Successfully")
    )

})

const loginUser = asyncHandler(async (req, res) => {
    //req body se data 
    //login on username or email
    //find user
    // cheack password 
    // generqate accsess and refresh token
    //send cookie

    const { username, email, password } = req.body

    // Reject non-string values: objects like {"$gt": ""} would act as query operators below
    if (
        [username, email].some((field) => field !== undefined && typeof field !== "string") ||
        typeof password !== "string"
    ) {
        throw new ApiError(400, "Invalid login credentials")
    }

    if (!username && !email) {
        throw new ApiError(400, "username or email required")
    }

    // Only include provided fields: an undefined field would become {} (match-all) if the driver ignores undefined
    const user = await User.findOne({
        $or: [username && { username }, email && { email }].filter(Boolean)
    })

    // Same message, status and (via the dummy hash) timing whether the account is missing or the
    // password is wrong, so login can't be used to discover which usernames/emails exist
    const isPasswordValid = user
        ? await user.isPasswordCorrect(password)
        : await bcrypt.compare(password, await dummyPasswordHash()) && false

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid username/email or password")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id)

    const loggeduser = await User.findById(user._id).select("-password -refreshToken")

    return setAuthCookies(res.status(200), accessToken, refreshToken)
        .json(
            new ApiResponse(
                200,
                {
                    // Tokens travel only in the httpOnly cookies set above, never in JSON,
                    // so page scripts (and any XSS) can't read them
                    user: loggeduser
                },
                "User logged Successfully"
            )
        )

})

const logoutUser = asyncHandler(async (req, res) => {
    //remove cookies and token

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1
            }
        },
        {
            new: true
        }
    )

    return res
        .status(200)
        .clearCookie("accessToken", authCookieBase())
        .clearCookie("refreshToken", authCookieBase())
        .json(new ApiResponse(200, {}, "logged Out successfully"))

})

const refreshAccessToken = asyncHandler(async (req, res) => {
    // Cookie only: refresh tokens are never exposed to page scripts, so none should arrive in a body
    const newRefreshToken = req.cookies?.refreshToken

    if (!newRefreshToken) {
        logger.warn('No refresh token provided in request');
        throw new ApiError(401, "No refresh token provided")
    }

    try {
        const decodedToken = jwt.verify(newRefreshToken, process.env.REFRESH_TOKEN_SECRET)

        const user = await User.findById(decodedToken?._id)

        if (!user) {
            throw new ApiError(401, "Invalid refresh Token")
        }

        if (newRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh Token expired or used")
        }

        const { accessToken: newgenAccessToken, refreshToken: newgenRefreshToken } = await generateAccessAndRefreshToken(user._id)

        return setAuthCookies(res.status(200), newgenAccessToken, newgenRefreshToken)
            .json(
                // New tokens are in the cookies above only
                new ApiResponse(200, {}, "Access Token refreshed")
            )

    } catch (error) {
        if (error instanceof ApiError) throw error
        // Bad/expired token -> 401; anything else (e.g. DB down) is a real 500 handled by errorHandler
        if (JWT_ERRORS.includes(error?.name)) {
            throw new ApiError(401, "Invalid or expired refresh token")
        }
        throw error
    }
})

const changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body

    if (typeof oldPassword !== "string" || !oldPassword) {
        throw new ApiError(400, "Old password is required")
    }

    const passwordProblem = passwordError(newPassword)
    if (passwordProblem) {
        throw new ApiError(400, passwordProblem)
    }

    const user = await User.findById(req.user?._id)
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Call the method to check if the old password is correct
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password")
    }

    // Update the user's password and revoke every existing session
    user.password = newPassword
    user.passwordChangedAt = new Date()
    user.refreshToken = undefined

    // Save the user, skipping validation if needed
    await user.save({ validateBeforeSave: false })

    // Keep this device logged in with fresh tokens; all other sessions are now invalid
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id)

    // Return a success response
    return setAuthCookies(res.status(200), accessToken, refreshToken)
        .json(new ApiResponse(200, {}, "Password changed successfully"))

})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(
            200,
            req.user,
            "current User fetched successfully"
        ))
})

// Same shape as the masking used for logs: enough to recognise, not the full address
const maskEmail = (email) => email.replace(/^(.)[^@]*/, "$1***")

const EMAIL_CHANGE_OTP = "email-change-otp"

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email, currentPassword } = req.body

    if (
        typeof fullName !== "string" || !fullName.trim() ||
        typeof email !== "string" || !email.trim()
    ) {
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findById(req.user?._id)
    if (!user) {
        throw new ApiError(404, "User not found")
    }

    user.fullName = fullName
    const newEmail = email.trim().toLowerCase()

    // Name-only update: applies immediately
    if (newEmail === user.email) {
        await user.save({ validateBeforeSave: false })
        return res
            .status(200)
            .json(new ApiResponse(200, user, "Account details updated successfully"))
    }

    // Email change: re-authenticate so a stolen access token alone can't redirect the account's
    // email (and with it, password resets). 400 not 401: a 401 makes the frontend log the user out.
    if (typeof currentPassword !== "string" || !currentPassword) {
        throw new ApiError(400, "Current password is required to change your email")
    }
    if (!(await user.isPasswordCorrect(currentPassword))) {
        throw new ApiError(400, "Incorrect password")
    }

    if (await User.exists({ email: newEmail })) {
        throw new ApiError(409, "This email is already in use")
    }

    // Email changes only after the new address is confirmed with a code sent to it
    const otp = crypto.randomInt(100000, 1000000).toString()
    user.pendingEmail = newEmail
    user.emailChangeOTP = hashOTP(otp, EMAIL_CHANGE_OTP)
    user.emailChangeOTPExpiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    user.emailChangeOTPAttempts = 0
    await user.save({ validateBeforeSave: false })

    const sent = await sendEmail({
        email: newEmail,
        subject: "VideoMela - Confirm your new email",
        text: `Your VideoMela email change code is: ${otp}. Valid for 10 minutes. If you did not request this, ignore this email.`,
    })
    if (!sent) {
        throw new ApiError(502, "Could not send the verification email. Please try again.")
    }

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            user,
            `Name saved. Enter the code sent to ${newEmail} to confirm your new email.`
        ))
})

const verifyEmailChange = asyncHandler(async (req, res) => {
    const { otp } = req.body

    if (!["string", "number"].includes(typeof otp) || !otp.toString().trim()) {
        throw new ApiError(400, "Verification code is required")
    }

    const user = await User.findById(req.user?._id)

    if (!user?.pendingEmail || !user.emailChangeOTP || !user.emailChangeOTPExpiry) {
        throw new ApiError(400, "No pending email change. Please request it again.")
    }

    if (new Date(user.emailChangeOTPExpiry).getTime() < Date.now()) {
        throw new ApiError(400, "Code has expired. Please request the email change again.")
    }

    // Atomically reserve an attempt so parallel guesses can't bypass the limit (as in verifyOTP)
    const attemptedUser = await User.findOneAndUpdate(
        { _id: user._id, emailChangeOTPAttempts: mongoose.trusted({ $not: { $gte: MAX_OTP_ATTEMPTS } }) },
        { $inc: { emailChangeOTPAttempts: 1 } },
        { new: true }
    )

    if (!attemptedUser) {
        await User.updateOne(
            { _id: user._id, emailChangeOTPAttempts: mongoose.trusted({ $gte: MAX_OTP_ATTEMPTS }) },
            { $unset: { pendingEmail: 1, emailChangeOTP: 1, emailChangeOTPExpiry: 1 } }
        )
        throw new ApiError(429, "Too many invalid attempts. Please request the email change again.")
    }

    if (!isOTPMatch(otp.toString().trim(), user.emailChangeOTP, EMAIL_CHANGE_OTP)) {
        const attemptsLeft = Math.max(0, MAX_OTP_ATTEMPTS - attemptedUser.emailChangeOTPAttempts)
        throw new ApiError(400, `Invalid code. ${attemptsLeft} attempt(s) left.`)
    }

    const oldEmail = user.email
    user.email = user.pendingEmail
    user.pendingEmail = undefined
    user.emailChangeOTP = undefined
    user.emailChangeOTPExpiry = undefined
    user.emailChangeOTPAttempts = 0

    try {
        await user.save({ validateBeforeSave: false })
    } catch (error) {
        // Someone registered this address after the change was requested
        if (error?.code === 11000) {
            await User.updateOne(
                { _id: user._id },
                { $unset: { pendingEmail: 1, emailChangeOTP: 1, emailChangeOTPExpiry: 1 } }
            )
            throw new ApiError(409, "This email is already in use")
        }
        throw error
    }

    // Tell the old address, so an unexpected change is noticed. Failure here doesn't undo the change.
    await sendEmail({
        email: oldEmail,
        subject: "VideoMela - Your email was changed",
        text: `The email on your VideoMela account was changed to ${maskEmail(user.email)}. If you did not do this, reset your password and contact support.`,
    })

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Email updated successfully"))
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarFile = req.file

    if (!avatarFile) {
        throw new ApiError(400, "Avatar file is missing")
    }

    // Get current user to access old avatar for deletion
    const currentUser = await User.findById(req.user._id).select("avatar");
    const avatarToDelete = currentUser.avatar?.public_id;

    // Upload new avatar to Cloudinary
    const avatar = await uploadonCloudinary(avatarFile.path, {
        folder: 'avatars',
        transformation: [{ width: 300, height: 300, crop: 'fill' }]
    })

    if (!avatar?.url) {
        throw new ApiError(400, "Error while uploading avatar")
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: {
                    public_id: avatar.public_id,
                    url: avatar.secure_url
                }
            }
        },
        { new: true }
    ).select("-password");

    // Delete old avatar from Cloudinary if it exists
    if (avatarToDelete) {
        await deleteonCloudinary(avatarToDelete);
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedUser, "Avatar image updated successfully")
        )
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageFile = req.file

    if (!coverImageFile) {
        throw new ApiError(400, "Cover image file is missing")
    }

    // Get current user to access old cover image for deletion
    const currentUser = await User.findById(req.user._id).select("coverImage");
    const coverImageToDelete = currentUser.coverImage?.public_id;

    // Upload new cover image to Cloudinary
    const coverImage = await uploadonCloudinary(coverImageFile.path, {
        folder: 'cover-images',
        transformation: [{ width: 800, height: 400, crop: 'fill' }]
    })

    if (!coverImage?.url) {
        throw new ApiError(400, "Error while uploading cover image")
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: {
                    public_id: coverImage.public_id,
                    url: coverImage.secure_url
                }
            }
        },
        { new: true }
    ).select("-password");

    // Delete old cover image from Cloudinary if it exists
    if (coverImageToDelete) {
        await deleteonCloudinary(coverImageToDelete);
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedUser, "Cover image updated successfully")
        )
})

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params

    if (!username?.trim()) {
        throw new ApiError(400, "username is missing")
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1
                // email intentionally omitted: any logged-in user can view any channel.
                // The owner gets their own email from /users/current_user.
            }
        }
    ])

    if (!channel?.length) {
        throw new ApiError(404, "channel does not exists")
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, channel[0], "User channel fetched successfully")
        )


})

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    // hide videos unpublished since they were watched
                    { $match: visibleTo(req.user._id) },
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                user[0].watchHistory,
                "Watch history fetched successfully"
            )
        )
})

const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (typeof email !== "string" || !email.trim()) {
        throw new ApiError(400, "Email is required");
    }

    // Unknown email, cooldown and success all get this same response (and similar timing: the
    // email is sent in the background), so this endpoint can't be used to find registered emails
    const genericResponse = () => res.status(200).json(
        new ApiResponse(200, {}, "If an account exists for this email, a reset code has been sent. It is valid for 10 minutes.")
    );

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
        return genericResponse();
    }

    // 60 seconds cooldown between codes for the same account (silent, see above)
    if (user.forgotPasswordLastRequested) {
        const timeDiffSeconds = (Date.now() - new Date(user.forgotPasswordLastRequested).getTime()) / 1000;
        if (timeDiffSeconds < 60) {
            return genericResponse();
        }
    }

    // Generate 6-digit OTP with a cryptographically secure RNG
    const otp = crypto.randomInt(100000, 1000000).toString();

    // Store only the hash, set 10 minute expiry and reset the attempt counter
    user.forgotPasswordOTP = hashOTP(otp);
    user.forgotPasswordOTPExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.forgotPasswordOTPAttempts = 0;
    user.forgotPasswordLastRequested = new Date();

    await user.save({ validateBeforeSave: false });

    // Send Email
    const emailSubject = "VideoMela - Password Reset OTP";
    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1f2937; color: #ffffff; border-radius: 8px;">
            <h2 style="color: #a855f7; text-align: center;">VideoMela Password Reset</h2>
            <p>Hello <strong>${escapeHtml(user.fullName)}</strong>,</p>
            <p>You requested to reset your password. Use the following 6-digit OTP code to verify your identity:</p>
            <div style="background-color: #374151; text-align: center; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #38bdf8;">${otp}</span>
            </div>
            <p style="color: #9ca3af; font-size: 14px;">This OTP code is valid for <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
            <hr style="border-color: #374151; margin-top: 20px;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">VideoMela Security Team</p>
        </div>
    `;

    // Not awaited: waiting on SMTP would make known emails measurably slower than unknown ones.
    // sendEmail never throws; a failed send is logged so it isn't silently ignored.
    sendEmail({
        email: user.email,
        subject: emailSubject,
        html: emailHtml,
        text: `Your VideoMela Password Reset OTP is: ${otp}. Valid for 10 minutes.`,
    }).then((sent) => {
        if (!sent) logger.error(`Password reset email could not be sent (user ${user._id})`);
    });

    return genericResponse();
});

const verifyOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (
        typeof email !== "string" || !email.trim() ||
        !["string", "number"].includes(typeof otp) || !otp.toString().trim()
    ) {
        throw new ApiError(400, "Email and OTP are required");
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Unknown email gets the same answer as "no code requested", so this can't reveal accounts either
    if (!user?.forgotPasswordOTP || !user.forgotPasswordOTPExpiry) {
        throw new ApiError(400, "No reset code was requested for this email, or it was already used. Please request a new code.");
    }

    if (new Date(user.forgotPasswordOTPExpiry).getTime() < Date.now()) {
        throw new ApiError(400, "OTP has expired. Please request a new OTP.");
    }

    // Atomically reserve an attempt so parallel guesses can't bypass the limit
    const attemptedUser = await User.findOneAndUpdate(
        { _id: user._id, forgotPasswordOTPAttempts: mongoose.trusted({ $not: { $gte: MAX_OTP_ATTEMPTS } }) },
        { $inc: { forgotPasswordOTPAttempts: 1 } },
        { new: true }
    );

    if (!attemptedUser) {
        // Burn the OTP so the attacker has to request a new one (which emails the owner)
        await User.updateOne(
            { _id: user._id, forgotPasswordOTPAttempts: mongoose.trusted({ $gte: MAX_OTP_ATTEMPTS }) },
            { $unset: { forgotPasswordOTP: 1, forgotPasswordOTPExpiry: 1 } }
        );
        throw new ApiError(429, "Too many invalid attempts. Please request a new OTP.");
    }

    if (!isOTPMatch(otp.toString().trim(), user.forgotPasswordOTP)) {
        const attemptsLeft = Math.max(0, MAX_OTP_ATTEMPTS - attemptedUser.forgotPasswordOTPAttempts);
        throw new ApiError(400, `Invalid OTP code. ${attemptsLeft} attempt(s) left.`);
    }

    // Generate short-lived reset token (signed JWT, expires in 15 mins)
    const resetToken = jwt.sign(
        {
            _id: user._id,
            email: user.email,
            purpose: "password_reset",
        },
        deriveSecret("password-reset-token"),
        { expiresIn: "15m" }
    );

    // Save reset token in DB for verification
    user.forgotPasswordResetToken = resetToken;
    // Clear OTP after successful verification
    user.forgotPasswordOTP = undefined;
    user.forgotPasswordOTPExpiry = undefined;
    user.forgotPasswordOTPAttempts = 0;

    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(
            200,
            { resetToken, email: user.email },
            "OTP verified successfully. You can now reset your password."
        )
    );
});

const resetPassword = asyncHandler(async (req, res) => {
    const { resetToken, newPassword } = req.body;

    if (typeof resetToken !== "string" || !resetToken) {
        throw new ApiError(400, "Reset token and new password are required");
    }

    const passwordProblem = passwordError(newPassword);
    if (passwordProblem) {
        throw new ApiError(400, passwordProblem);
    }

    let decoded;
    try {
        decoded = jwt.verify(resetToken, deriveSecret("password-reset-token"));
    } catch (err) {
        throw new ApiError(401, "Invalid or expired password reset token. Please restart the forgot password process.");
    }

    if (decoded.purpose !== "password_reset") {
        throw new ApiError(401, "Invalid token purpose");
    }

    const user = await User.findById(decoded._id);

    if (!user || user.forgotPasswordResetToken !== resetToken) {
        throw new ApiError(401, "Invalid or expired password reset token");
    }

    // Update password (pre('save') hook will hash with bcrypt)
    user.password = newPassword;

    // Revoke every existing session (e.g. an attacker's) on reset
    user.passwordChangedAt = new Date();
    user.refreshToken = undefined;

    // Clear forgot password fields
    user.forgotPasswordResetToken = undefined;
    user.forgotPasswordOTP = undefined;
    user.forgotPasswordOTPExpiry = undefined;
    user.forgotPasswordOTPAttempts = 0;
    user.forgotPasswordLastRequested = undefined;

    await user.save();

    return res.status(200).json(
        new ApiResponse(200, {}, "Password reset successfully. Please log in with your new password.")
    );
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changePassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
    forgotPassword,
    verifyOTP,
    resetPassword,
    verifyEmailChange
}