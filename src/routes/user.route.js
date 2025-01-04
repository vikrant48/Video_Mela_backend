import { Router } from "express";
import { 
    registerUser, 
    loginUser, 
    logoutUser, 
    refreshAccessToken, 
    changePassword, 
    getUser, 
    updateAccountDetails,
    updateUserAvatar, 
    updateUserCoverImage, 
    getUserChannelProfile, 
    getWatchHistory
    } 
    from "../controllers/user.controler.js";

import { upload } from "../middlewares/multer.js";
import { verifyJWT } from "../middlewares/auth.js"

const router = Router()

router.route("/register").post(
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),
    registerUser
)
router.route("/login").post(loginUser)

//securd route
router.route("/logout").post(verifyJWT,logoutUser)
router.route("/refresh_token").post(refreshAccessToken )
router.route("/change_password").post(verifyJWT, changePassword)
router.route("/current_user").get(verifyJWT, getUser)
router.route("/update_account").patch(verifyJWT, updateAccountDetails)
router.route("/avatar").patch(verifyJWT, upload.single("avatar"), updateUserAvatar)
router.route("/coverImage").patch(verifyJWT, upload.single("coverImage"), updateUserCoverImage)
router.route("/c/:username").get(verifyJWT, getUserChannelProfile)
router.route("/history").get(verifyJWT, getWatchHistory)



export default router