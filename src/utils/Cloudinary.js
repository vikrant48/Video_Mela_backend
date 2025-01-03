import { v2 as cloudinary } from 'cloudinary';
import fs from "fs"


cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadonCloudinary = async (localFilePath)=>{
    try {
        if(!localFilePath) return null
        // upload
        const uploadedFile = await cloudinary.uploader.upload(localFilePath, {
            resource_type: 'auto'
        })
        console.log('File uploaeded Successfully ', uploadedFile.url)
        return uploadedFile
        
    } catch (error) {
        fs.unlinkSync(localFilePath)
        return null
        
    }
}

export {uploadonCloudinary}