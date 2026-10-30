import multer from "multer"
import os from "os"
import fs from "fs"
import crypto from "crypto"
import { ApiError } from "../utils/ApiError.js"

const MB = 1024 * 1024
export const MAX_IMAGE_SIZE = 10 * MB
export const MAX_VIDEO_SIZE = 100 * MB

// SVG is deliberately excluded: it can carry script
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"]
const IMAGE_TYPES_LABEL = "JPEG, PNG, WebP, GIF, AVIF or HEIC"

const isImage = (file) => IMAGE_TYPES.includes(file.mimetype)
const isVideo = (file) => file.mimetype.startsWith("video/")

// Caps how much non-file form data a request can make the server buffer
const formLimits = { fields: 20, fieldSize: 64 * 1024 }

// Files are streamed to disk, never held in RAM, so concurrent uploads can't exhaust memory.
// os.tmpdir(), not public/: express.static serves public/. Temp files are removed by cleanupTempFiles.
const storage = multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `videomela-${crypto.randomUUID()}`)
})

// ---- Content check -------------------------------------------------------------------------
// fileFilter only sees the mimetype the client claims. After the file is on disk, its first bytes
// are compared with the signatures of the allowed formats, so e.g. HTML, SVG or an executable
// renamed to .png is rejected. Only a fixed-size header is read: no parsing, so a malformed
// file can't trigger parser bugs (the reason no file-type library is used here).

const HEADER_BYTES = 32
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ASF_SIGNATURE = Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]) // WMV/ASF
// ISO base media files (MP4, MOV, 3GP, AVIF, HEIC) share the "ftyp" box; its brand says which
const ISO_IMAGE_BRANDS = ["avif", "avis", "heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]
// Older QuickTime files can start with one of these atoms instead of "ftyp"
const QUICKTIME_ATOMS = ["moov", "mdat", "wide", "free", "skip", "pnot"]

const ascii = (buf, start, end) => buf.toString("latin1", start, end)

// Returns "image", "video" or null (not an allowed format)
export const detectMediaKind = (buf) => {
    if (buf.length < 12) return null
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image" // JPEG
    if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return "image"
    if (["GIF87a", "GIF89a"].includes(ascii(buf, 0, 6))) return "image"
    if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "image"
    if (ascii(buf, 4, 8) === "ftyp") return ISO_IMAGE_BRANDS.includes(ascii(buf, 8, 12)) ? "image" : "video"
    if (QUICKTIME_ATOMS.includes(ascii(buf, 4, 8))) return "video"
    if (buf.readUInt32BE(0) === 0x1a45dfa3) return "video" // WebM / Matroska
    if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 11) === "AVI") return "video"
    if ([0x000001ba, 0x000001b3].includes(buf.readUInt32BE(0))) return "video" // MPEG program stream / MPEG video
    if (ascii(buf, 0, 3) === "FLV") return "video"
    if (buf.subarray(0, 8).equals(ASF_SIGNATURE)) return "video"
    return null
}

const readHeader = async (path) => {
    const handle = await fs.promises.open(path, "r")
    try {
        const buf = Buffer.alloc(HEADER_BYTES)
        const { bytesRead } = await handle.read(buf, 0, HEADER_BYTES, 0)
        return buf.subarray(0, bytesRead)
    } finally {
        await handle.close()
    }
}

// Rejects any uploaded file whose actual bytes aren't the kind its field expects.
// Rejected files are deleted by cleanupTempFiles.
const verifyFileContents = async (req, res, next) => {
    try {
        const files = [req.file, ...Object.values(req.files ?? {}).flat()].filter(Boolean)
        for (const file of files) {
            const expected = file.fieldname === "videoFile" ? "video" : "image"
            if (detectMediaKind(await readHeader(file.path)) !== expected) {
                throw new ApiError(400, expected === "video"
                    ? `${file.fieldname}: file content is not a supported video format`
                    : `${file.fieldname}: file content is not a ${IMAGE_TYPES_LABEL} image`)
            }
        }
        next()
    } catch (error) {
        next(error)
    }
}

// Every .single()/.fields() middleware also runs the content check, so no route can skip it
const withContentCheck = (upload) => ({
    single: (name) => [upload.single(name), verifyFileContents],
    fields: (fields) => [upload.fields(fields), verifyFileContents]
})

// Avatars, cover images and thumbnail updates
export const uploadImage = withContentCheck(multer({
    storage,
    limits: { ...formLimits, fileSize: MAX_IMAGE_SIZE, files: 2 },
    fileFilter: (req, file, cb) => {
        if (isImage(file)) cb(null, true)
        else cb(new ApiError(400, `Only ${IMAGE_TYPES_LABEL} images are allowed`))
    }
}))

// Video publishing: videoFile + thumbnail. fileSize applies to both, so the thumbnail
// is held to MAX_IMAGE_SIZE in the controller.
export const uploadVideo = withContentCheck(multer({
    storage,
    limits: { ...formLimits, fileSize: MAX_VIDEO_SIZE, files: 2 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === "videoFile" && isVideo(file)) return cb(null, true)
        if (file.fieldname === "thumbnail" && isImage(file)) return cb(null, true)
        cb(new ApiError(400, file.fieldname === "videoFile"
            ? "videoFile must be a video"
            : `thumbnail must be a ${IMAGE_TYPES_LABEL} image`))
    }
}))

// Text-only multipart forms (comments, tweets, playlists)
export const parseForm = multer({ limits: formLimits }).none()

// Deletes this request's temp upload files once the response has finished or the client
// disconnected, whatever the outcome. Mounted app-wide so no upload route can forget it.
export const cleanupTempFiles = (req, res, next) => {
    res.on("close", () => {
        const files = [req.file, ...Object.values(req.files ?? {}).flat()]
        for (const file of files) {
            if (file?.path) fs.promises.unlink(file.path).catch(() => {})
        }
    })
    next()
}
