import mongoose, { Schema } from "mongoose"

const subscriptionSchema = new Schema(
    {
        subscriber: {
            type: Schema.Types.ObjectId, // one who is subscribing
            ref: "User"
        },
        channel: {
            type: Schema.Types.ObjectId, // one to whom 'subscriber' is subscribing
            ref: "User"
        }

    },
    {
        timestamps: true
    }
)


// One subscription per subscriber/channel pair, enforced by the database (concurrent toggles)
subscriptionSchema.index({ subscriber: 1, channel: 1 }, { unique: true })

export const Subscription = mongoose.model("Subscription", subscriptionSchema)