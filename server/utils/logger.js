const LEVELS = ['debug', 'info', 'warn', 'error'];

/**
 * 格式化日志元数据
 * @param {*} meta - 元数据（字符串、对象等）
 * @returns {string} - 格式化后的元数据字符串
 */
function formatMeta(meta) {
    if (!meta) return '';
    if (typeof meta === 'string') return ` ${meta}`;
    try {
        return ` ${JSON.stringify(meta)}`;
    } catch (e) {
        return ' [meta-unserializable]';
    }
}

/**
 * 创建分级日志记录器
 * @param {string} scope - 日志范围标签（如 'socket'、'gameplay' 等）
 * @param {string} session - 会话标签（如 socket ID）
 * @returns {Object} - 日志记录对象 { debug, info, warn, error }
 */
function createLogger(scope = 'app', session = '') {
    const prefix = scope ? `[${scope}]` : '';
    const sessionLabel = session ? `[${session}]` : '';

    const logger = {};
    LEVELS.forEach(level => {
        logger[level] = (msg, meta) => {
            const line = `[${level.toUpperCase()}]${prefix}${sessionLabel} ${msg}${formatMeta(meta)}`;
            if (level === 'error') {
                console.error(line);
            } else if (level === 'warn') {
                console.warn(line);
            } else {
                console.log(line);
            }
        };
    });
    return logger;
}

module.exports = {
    createLogger
};
