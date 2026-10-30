import mongoose, { isValidObjectId } from "mongoose"
import { Video, visibleTo } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { Like } from "../models/like.model.js"
import { Comment } from "../models/comment.model.js"
import { Playlist } from "../models/playlist.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadonCloudinary, deleteonCloudinary } from "../utils/Cloudinary.js"
import { MAX_IMAGE_SIZE } from "../middlewares/multer.js"


// Fields the feed may be sorted by; anything else falls back to newest first
const SORTABLE_FIELDS = ["createdAt", "views", "duration", "title"]
// Upper bound on page size so one request can't pull the whole collection
const MAX_PAGE_SIZE = 100

const getAllVideos = asyncHandler(async (req, res) => {
    const { page, limit, query, sortBy, sortType, userId } = req.query
    // get all videos based on query, sort, pagination

    // Query-string values can also arrive as arrays/objects (?query[a]=b), so check types
    if (query !== undefined && typeof query !== "string") {
        throw new ApiError(400, "Invalid search query")
    }
    if (userId !== undefined && typeof userId !== "string") {
        throw new ApiError(400, "Invalid userId")
    }
    const pageNumber = Math.max(1, parseInt(page, 10) || 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit, 10) || 10))

    const pipeline = []

    if (query) {
        pipeline.push({
            $search: {
                index: "search-videos",
                text: {
                    query: query,
                    path: ["title", "description"]
                }
            }
        });
    }

    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId")
        }

        pipeline.push({
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        });
    }

    // fetch videos only that are set isPublished as true
    pipeline.push({ $match: { isPublished: true } })

    // sortBy must be an allowed field (it becomes a pipeline key); sortType "asc" or anything else = desc
    if (SORTABLE_FIELDS.includes(sortBy)) {
        pipeline.push({
            $sort: {
                [sortBy]: sortType === "asc" ? 1 : -1
            }
        });
    } else {
        pipeline.push({ $sort: { createdAt: -1 } })
    }

    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$ownerDetails"
        }
    )

    const videoAggregate = Video.aggregate(pipeline)

    const options = {
        page: pageNumber,
        limit: pageSize
    };

    const video = await Video.aggregatePaginate(videoAggregate, options)

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Videos fetched successfully"))
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body

    // Validate everything before uploading: a rejected request must not leave files on Cloudinary
    if ([title, description].some((field) => typeof field !== "string" || !field.trim())) {
        throw new ApiError(400, "Title and description are required");
    }

    const videoFileLocal = req.files?.videoFile?.[0];
    const thumbnailLocal = req.files?.thumbnail?.[0];

    if (!videoFileLocal) {
        throw new ApiError(400, "Video file is required")
    }

    if (!thumbnailLocal) {
        throw new ApiError(400, "Thumbnail file is required")
    }

    // multer's fileSize limit on this route is the video limit, so cap the thumbnail here
    if (thumbnailLocal.size > MAX_IMAGE_SIZE) {
        throw new ApiError(413, `Thumbnail must be at most ${MAX_IMAGE_SIZE / (1024 * 1024)} MB`)
    }

    // upload to cloudinary
    const videoFile = await uploadonCloudinary(videoFileLocal.path, {
        folder: 'videos',
        resource_type: 'video'
    })

    if (!videoFile) {
        throw new ApiError(400, "Video file upload failed");
    }

    const thumbnail = await uploadonCloudinary(thumbnailLocal.path, {
        folder: 'thumbnails',
        transformation: [{ width: 1280, height: 720, crop: 'fill' }]
    })

    if (!thumbnail) {
        // Don't leave the already-uploaded video orphaned on Cloudinary
        await deleteonCloudinary(videoFile.public_id, "video")
        throw new ApiError(400, "Thumbnail upload failed");
    }

    // create video (https URLs: the site is served over https, http media would be mixed content)
    let video
    try {
        video = await Video.create({
            title,
            description,
            duration: videoFile.duration,
            videoFile: {
                url: videoFile.secure_url,
                public_id: videoFile.public_id
            },
            thumbnail: {
                url: thumbnail.secure_url,
                public_id: thumbnail.public_id
            },
            owner: req.user?._id,
            isPublished: false
        })
    } catch (error) {
        // Saving failed: remove the uploads so they don't sit on Cloudinary unreferenced
        await deleteonCloudinary(videoFile.public_id, "video")
        await deleteonCloudinary(thumbnail.public_id)
        throw error
    }

    //check if video is uploaded or not 
    const videoUploaded = await Video.findById(video._id)

    if (!videoUploaded) {
        throw new ApiError(500, "Video upload failed please try again !!!")
    }

    return res
        .status(201)
        .json(new ApiResponse(201, video, "Video uploaded successfully"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    if (!isValidObjectId(req.user?._id)) {
        throw new ApiError(400, "Invalid userId");
    }

    const video = await Video.aggregate([
        // Find the video by its ID; other users' unpublished videos are treated as not existing
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId),
                ...visibleTo(req.user._id)
            }
        },
        // Lookup likes for the video
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes"
            }
        },
        // okup owner details
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $lookup: {
                            from: "subscriptions",
                            localField: "_id",
                            foreignField: "channel",
                            as: "subscribers"
                        }
                    },
                    {
                        $addFields: {
                            subscribersCount: {
                                $size: "$subscribers"
                            },
                            isSubscribed: {
                                $cond: {
                                    if: {
                                        $in: [
                                            req.user?._id,
                                            "$subscribers.subscriber"
                                        ]
                                    },
                                    then: true,
                                    else: false
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1,
                            subscribersCount: 1,
                            isSubscribed: 1
                        }
                    }
                ]
            }
        },
        // Add computed fields to the video data
        {
            $addFields: {
                likesCount: {
                    $size: "$likes"
                },
                owner: {
                    $first: "$owner"
                },
                isLiked: {
                    $cond: {
                        if: { $in: [req.user?._id, "$likes.likedBy"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                "videoFile.url": 1,
                title: 1,
                description: 1,
                views: 1,
                createdAt: 1,
                duration: 1,
                comments: 1,
                owner: 1,
                likesCount: 1,
                isLiked: 1
            }
        }
    ])

    // aggregate always returns an array: check length so missing/hidden videos 404
    // before views and watch history are touched
    if (!video.length) {
        throw new ApiError(404, "Video not found");
    }

    // add this video to user watch history
    const { modifiedCount } = await User.updateOne(
        { _id: req.user?._id },
        {
            $addToSet: {
                watchHistory: videoId
            }
        },
        // Without this Mongoose also sets updatedAt, so the user always counts as "modified"
        // and every reload would add a view
        { timestamps: false }
    )

    // Count a view only the first time this user opens the video ($addToSet modified the history),
    // so reloading a page can't inflate the count. Atomic per request: rapid refreshes can't race.
    if (modifiedCount) {
        await Video.updateOne({ _id: videoId }, { $inc: { views: 1 } })
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, video[0], "video details fetched successfully")
        );
})

const updateVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body
    const { videoId } = req.params
    // update video details like title, description, thumbnail

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId")
    }

    if ([title, description].some((field) => typeof field !== "string" || !field.trim())) {
        throw new ApiError(400, "title and description are required")
    }

    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "No video found")
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You can't edit this video as you are not the owner"
        )
    }

    //deleting old thumbnail and updating with new one
    const thumbnailToDelete = video.thumbnail.public_id;

    const thumbnailFile = req.file;

    if (!thumbnailFile) {
        throw new ApiError(400, "thumbnail is required")
    }

    const thumbnail = await uploadonCloudinary(thumbnailFile.path, {
        folder: 'thumbnails',
        transformation: [{ width: 1280, height: 720, crop: 'fill' }]
    })

    if (!thumbnail) {
        throw new ApiError(400, "thumbnail upload failed");
    }

    let updatedVideo
    try {
        updatedVideo = await Video.findByIdAndUpdate(
            videoId,
            {
                $set: {
                    title,
                    description,
                    thumbnail: {
                        public_id: thumbnail.public_id,
                        url: thumbnail.secure_url
                    }
                }
            },
            { new: true }
        )
    } catch (error) {
        await deleteonCloudinary(thumbnail.public_id) // don't orphan the new upload
        throw error
    }

    if (!updatedVideo) {
        // Video deleted meanwhile: the new thumbnail has nothing to belong to
        await deleteonCloudinary(thumbnail.public_id)
        throw new ApiError(404, "No video found")
    }

    if (updatedVideo) {
        await deleteonCloudinary(thumbnailToDelete)
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedVideo, "Video updated successfully"))

})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    // delete video

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId")
    }

    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "No video found")
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You can't delete this video as you are not the owner"
        )
    }

    const videoDeleted = await Video.findByIdAndDelete(video?._id)

    if (!videoDeleted) {
        throw new ApiError(400, "Failed to delete the video please try again");
    }

    await deleteonCloudinary(video.thumbnail.public_id); // video model has thumbnail public_id stored in it->check videoModel
    await deleteonCloudinary(video.videoFile.public_id, "video"); // specify video while deleting video

    // delete video likes
    await Like.deleteMany({
        video: videoId
    })

    // delete likes on the video's comments, then the comments
    const commentIds = await Comment.distinct("_id", { video: videoId })

    await Like.deleteMany({
        comment: mongoose.trusted({ $in: commentIds })
    })

    await Comment.deleteMany({
        video: videoId,
    })

    // remove dangling references from playlists and watch histories
    await Playlist.updateMany(
        { videos: videoId },
        { $pull: { videos: videoId } }
    )

    await User.updateMany(
        { watchHistory: videoId },
        { $pull: { watchHistory: videoId } }
    )

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video deleted successfully"));
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You can't toogle publish status as you are not the owner"
        );
    }

    const toggledVideoPublish = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                isPublished: !video?.isPublished
            }
        },
        { new: true }
    );

    if (!toggledVideoPublish) {
        throw new ApiError(500, "Failed to toogle video publish status");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { isPublished: toggledVideoPublish.isPublished },
                "Video publish toggled successfully"
            )
        );
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}