import { Router } from "express";
import { uploadImage, uploadVideo } from "../middlewares/multer.js";
import { verifyJWT } from "../middlewares/auth.js";
import { videoUploadLimiter } from "../middlewares/rateLimit.js";
import {
    deleteVideo,
    getAllVideos,
    getVideoById,
    updateVideo,
    publishAVideo,
    togglePublishStatus,
} from "../controllers/video.controler.js";

const router = Router();

// router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router
    .route("/")
    .get(getAllVideos)
    .post(
        verifyJWT,
        videoUploadLimiter,
        uploadVideo.fields([
            {
                name: "videoFile",
                maxCount: 1
            },
            {
                name: "thumbnail",
                maxCount: 1
            }
        ]),
        publishAVideo
    );

router
    .route("/v/:videoId")
    .get(verifyJWT, getVideoById)
    .delete(verifyJWT, deleteVideo)
    .patch(verifyJWT, uploadImage.single("thumbnail"), updateVideo);

router.route("/toggle/publish/:videoId").patch(verifyJWT, togglePublishStatus);

export default router;