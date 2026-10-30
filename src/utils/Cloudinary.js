import { v2 as cloudinary } from 'cloudinary';
import { logger } from "./logger.js"


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Uploads a file from disk. The SDK streams it, so it is never fully loaded into memory.
// The local temp file is deleted by the cleanupTempFiles middleware, not here.
// Returns null on failure.
const uploadonCloudinary = async (localFilePath, options = {}) => {
    try {
        if (!localFilePath) return null

        return await cloudinary.uploader.upload(localFilePath, {
            // 'image' unless the caller says 'video': with 'auto', a non-media file would be
            // stored as a downloadable 'raw' asset instead of being rejected by Cloudinary
            resource_type: 'image',
            folder: options.folder || 'uploads',
            ...options
        })
    } catch (error) {
        logger.error('Cloudinary upload error:', error)
        return null
    }
}

const deleteonCloudinary = async (public_id, resource_type = "image") => {
    try {
        if (!public_id) return null;

        //delete file from cloudinary
        const result = await cloudinary.uploader.destroy(public_id, {
            resource_type: `${resource_type}`
        });
    } catch (error) {
        logger.error("delete on cloudinary failed", error);
        return error;
    }
}

export { uploadonCloudinary, deleteonCloudinary }