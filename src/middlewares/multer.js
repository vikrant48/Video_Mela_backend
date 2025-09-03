import multer from "multer"

// Use memory storage for direct upload to Cloudinary
const storage = multer.memoryStorage()

export const upload = multer({ 
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit for videos
    },
    fileFilter: (req, file, cb) => {
        // Allow image files (for avatars, cover images, thumbnails)
        if (file.mimetype.startsWith('image/')) {
            cb(null, true)
        }
        // Allow video files (for video uploads)
        else if (file.mimetype.startsWith('video/')) {
            cb(null, true)
        }
        else {
            cb(new Error('Only image and video files are allowed!'))
        }
    }
})