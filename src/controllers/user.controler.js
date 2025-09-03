import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadonCloudinary, deleteonCloudinary } from "../utils/Cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforesave: false })

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

    if (
        [fullName, email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }
    //console.log(req.files);

    // Check if files are uploaded
    if (!req.files) {
        throw new ApiError(400, "Avatar and cover image files are required. Please upload files using multipart/form-data.")
    }

    const avatarFile = req.files?.avatar?.[0];
    const coverImageFile = req.files?.coverImage?.[0];

    if (!avatarFile) {
        throw new ApiError(400, "Avatar file is required. Please upload an avatar image.")
    }

    // Upload avatar to Cloudinary (required)
    const avatar = await uploadonCloudinary(avatarFile.buffer, {
        folder: 'avatars',
        transformation: [{ width: 300, height: 300, crop: 'fill' }]
    })

    // Upload cover image to Cloudinary (optional)
    let coverImage = null;
    if (coverImageFile) {
        coverImage = await uploadonCloudinary(coverImageFile.buffer, {
            folder: 'cover-images',
            transformation: [{ width: 800, height: 400, crop: 'fill' }]
        })
    }

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }


    const user = await User.create({
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

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered Successfully")
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

    if (!username && !email) {
        throw new ApiError(400, "username or email required")
    }

    const user = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (!user) {
        throw new ApiError(404, "User does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(401, "password is incorrect!!")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id)

    const loggeduser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggeduser, accessToken, refreshToken
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

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "logged Out successfully"))

})

const refreshAccessToken = asyncHandler(async(req, res)=>{
    const newRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!newRefreshToken) {
        throw new ApiError(401, "Invalid Token")
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
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {newgenAccessToken, newgenRefreshToken} = generateAccessAndRefreshToken(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", newgenAccessToken,options)
        .cookie("refreshToken", newgenRefreshToken, options)
        .json(
             new ApiResponse(
                200, 
                {
                  newgenAccessToken, 
                  newgenRefreshToken  
                },
                "Access Token refreshed"
    
            )
        )
    
    } catch (error) {
        throw new ApiError(401, error?.message || "invalid refresh tolen")  
    }
})

const changePassword = asyncHandler(async(req, res)=>{
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Call the method to check if the old password is correct
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password")  
    }
    
    // Update the user's password
    user.password = newPassword

    // Save the user, skipping validation if needed
    await user.save({validateBeforeSave: false})

    // Return a success response
    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"))

})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(
        200,
        req.user,
        "current User fetched successfully"
    ))
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body

    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email: email
            }
        },
        {new: true}
        
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))
})

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarFile = req.file

    if (!avatarFile) {
        throw new ApiError(400, "Avatar file is missing")
    }

    // Get current user to access old avatar for deletion
    const currentUser = await User.findById(req.user._id).select("avatar");
    const avatarToDelete = currentUser.avatar?.public_id;

    // Upload new avatar to Cloudinary
    const avatar = await uploadonCloudinary(avatarFile.buffer, {
        folder: 'avatars',
        transformation: [{ width: 300, height: 300, crop: 'fill' }]
    })

    if (!avatar.url) {
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

const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageFile = req.file

    if (!coverImageFile) {
        throw new ApiError(400, "Cover image file is missing")
    }

    // Get current user to access old cover image for deletion
    const currentUser = await User.findById(req.user._id).select("coverImage");
    const coverImageToDelete = currentUser.coverImage?.public_id;

    // Upload new cover image to Cloudinary
    const coverImage = await uploadonCloudinary(coverImageFile.buffer, {
        folder: 'cover-images',
        transformation: [{ width: 800, height: 400, crop: 'fill' }]
    })

    if (!coverImage.url) {
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

const getUserChannelProfile = asyncHandler(async(req, res)=>{
    const {username} = req.params

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
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
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
                coverImage: 1,
                email: 1

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

const getWatchHistory = asyncHandler(async(req, res) => {
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
                        $addFields:{
                            owner:{
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
    getWatchHistory
}