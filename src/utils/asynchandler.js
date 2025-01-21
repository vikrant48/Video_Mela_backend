const asyncHandler = (reqHandler) => {
    return async (req, res, next) => {
        try {
            await Promise
                .resolve(reqHandler(req, res, next))
        } catch (error) {
            const statusCode = error.statusCode || 500
            const errorMessage = error.message || "internal Server Error"
            res.status(statusCode).json({
                success: false,
                error: errorMessage,
            })

        }
    }
}

export { asyncHandler }