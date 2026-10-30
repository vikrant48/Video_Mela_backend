// Forwards errors from async handlers to the central errorHandler middleware, which decides
// what is safe to send to the client (see middlewares/errorHandler.js)
const asyncHandler = (reqHandler) => {
    return async (req, res, next) => {
        try {
            await Promise
                .resolve(reqHandler(req, res, next))
        } catch (error) {
            next(error)
        }
    }
}

export { asyncHandler }
