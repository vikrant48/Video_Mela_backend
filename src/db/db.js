import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import { logger } from "../utils/logger.js";

// Defense in depth against NoSQL injection: user-supplied objects with $-keys in query
// filters are wrapped in $eq. Wrap server-built operator filters in mongoose.trusted().
// Does not apply to aggregation pipelines.
mongoose.set("sanitizeFilter", true);

const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        logger.info(`MONGODB CONNECTED !! DB Host : ${connectionInstance.connection.host}`)

    } catch (error) {
        logger.error('DB Connection failed', error)
        process.exit(1);
    }
}

export default connectDB