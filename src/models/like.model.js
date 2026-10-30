import mongoose, {Schema} from "mongoose";

const likeSchema = new Schema({
    video: {
        type: Schema.Types.ObjectId,
        ref: "Video"
    },
    comment: {
        type: Schema.Types.ObjectId,
        ref: "Comment"
    },
    tweet: {
        type: Schema.Types.ObjectId,
        ref: "Tweet"
    },
    likedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    
}, {timestamps: true})

// One like per user per target, enforced by the database so concurrent toggles can't create
// duplicates. Partial: each like sets only one of video/comment/tweet, so likes of other kinds
// (where this field is absent) must not count as duplicates of each other.
for (const target of ["video", "comment", "tweet"]) {
    likeSchema.index(
        { likedBy: 1, [target]: 1 },
        { unique: true, partialFilterExpression: { [target]: { $exists: true } } }
    )
}

export const Like = mongoose.model("Like", likeSchema)