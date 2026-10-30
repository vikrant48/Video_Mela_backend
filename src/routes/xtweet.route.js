import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.js";
import {
    createTweet,
    deleteTweet,
    updateTweet,
    getUserTweets,
} from "../controllers/tweet.controler.js";
import { parseForm } from "../middlewares/multer.js";

const router = Router();

router.use(verifyJWT, parseForm); // Apply verifyJWT middleware to all routes in this file

router.route("/").post(createTweet);
router.route("/user/:userId").get(getUserTweets);
router.route("/:tweetId").patch(updateTweet).delete(deleteTweet);

export default router;