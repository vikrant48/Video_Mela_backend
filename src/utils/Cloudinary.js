import { v2 as cloudinary } from 'cloudinary';
import fs from "fs"
import { logger } from "./logger.js"


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadonCloudinary = async (fileBuffer, options = {}) => {
    try {
        if (!fileBuffer) return null

        return new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                {
                    resource_type: 'auto',
                    folder: options.folder || 'uploads',
                    ...options
                },
                (error, result) => {
                    if (error) {
                        reject(error)
                    } else {
                        resolve(result)
                    }
                }
            ).end(fileBuffer)
        })

    } catch (error) {
        logger.error('Cloudinary upload error:', error)
        return null
    }
}

// Legacy function for backward compatibility (file path uploads)
const uploadFileToCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null
        // upload
        const uploadedFile = await cloudinary.uploader.upload(localFilePath, {
            resource_type: 'auto'
        })
        fs.unlinkSync(localFilePath) // this will also unlink from local path 
        return uploadedFile

    } catch (error) {
        fs.unlinkSync(localFilePath)
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

export { uploadonCloudinary, uploadFileToCloudinary, deleteonCloudinary }