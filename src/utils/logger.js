const getTimestamp = () => new Date().toISOString();

export const logger = {
    info: (message, ...meta) => {
        console.log(`[${getTimestamp()}] [INFO] ${message}`, meta.length ? meta : '');
    },
    warn: (message, ...meta) => {
        console.warn(`[${getTimestamp()}] [WARN] ${message}`, meta.length ? meta : '');
    },
    error: (message, ...meta) => {
        console.error(`[${getTimestamp()}] [ERROR] ${message}`, meta.length ? meta : '');
    },
    http: (message, ...meta) => {
        console.log(`[${getTimestamp()}] [HTTP] ${message}`, meta.length ? meta : '');
    }
};
