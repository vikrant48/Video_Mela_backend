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
        fs.unlinkSync(localFilePath)
        return uploadedFile
        
    } catch (error) {
        fs.unlinkSync(localFilePath)
        return null
        
    }
}

const deleteonCloudinary = async (public_id, resource_type="image") => {
    try {
        if (!public_id) return null;

        //delete file from cloudinary
        const result = await cloudinary.uploader.destroy(public_id, {
            resource_type: `${resource_type}`
        });
    } catch (error) {
        console.log("delete on cloudinary failed", error);
        return error;
    }
}

export {uploadonCloudinary, deleteonCloudinary}