import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        avatar: {
            type: {
                public_id: String,
                url: String //cloudinary url
            },
            required: true,
        },
        coverImage: {
            type: {
                public_id: String,
                url: String //cloudinary url
            },
        },
        watchHistory: [
            {
                type: Schema.Types.ObjectId,
                ref: "Video"
            }
        ],
        password: {
            type: String,
            required: [true, 'Password is required']
        },
        refreshToken: {
            type: String
        },
        // Access tokens issued before this are rejected (see verifyJWT)
        passwordChangedAt: {
            type: Date
        },
        forgotPasswordOTP: {
            type: String
        },
        forgotPasswordOTPExpiry: {
            type: Date
        },
        forgotPasswordOTPAttempts: {
            type: Number,
            default: 0
        },
        forgotPasswordResetToken: {
            type: String
        },
        forgotPasswordLastRequested: {
            type: Date
        },
        // Email change awaiting confirmation via a code sent to the new address
        pendingEmail: {
            type: String,
            lowercase: true,
            trim: true
        },
        emailChangeOTP: {
            type: String
        },
        emailChangeOTPExpiry: {
            type: Date
        },
        emailChangeOTPAttempts: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
)

// Never sent to clients, whichever endpoint serializes a user document (res.json calls toJSON).
// Server code can still read them; aggregation results are unaffected (they project explicitly).
const PRIVATE_FIELDS = [
    "password",
    "refreshToken",
    "passwordChangedAt",
    "forgotPasswordOTP",
    "forgotPasswordOTPExpiry",
    "forgotPasswordOTPAttempts",
    "forgotPasswordResetToken",
    "forgotPasswordLastRequested",
    "emailChangeOTP",
    "emailChangeOTPExpiry",
    "emailChangeOTPAttempts"
]

userSchema.set("toJSON", {
    transform: (doc, ret) => {
        for (const field of PRIVATE_FIELDS) delete ret[field]
        return ret
    }
})

// Pre middleware functions are executed one after another, when each middleware calls next.
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();

    this.password = await bcrypt.hash(this.password, 10)
    next()
})

userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password)
}

userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            username: this.username,
            fullName: this.fullName,
            typ: "access"
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    )
}
userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            _id: this._id,

        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    )
}


export const User = mongoose.model("User", userSchema)