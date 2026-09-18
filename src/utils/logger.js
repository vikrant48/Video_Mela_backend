export const logger = {
    info: (message, ...meta) => {
        console.log(`[INFO] ${message}`, meta.length ? meta : '');
    },
    warn: (message, ...meta) => {
        console.warn(`[WARN] ${message}`, meta.length ? meta : '');
    },
    error: (message, ...meta) => {
        console.error(`[ERROR] ${message}`, meta.length ? meta : '');
    },
    http: (message, ...meta) => {
        console.log(`${message}`, meta.length ? meta : '');
    }
};
