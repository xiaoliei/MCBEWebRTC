/**
 * 配置管理模块
 *
 * 功能概述：
 * - 从环境变量读取配置
 * - 提供类型安全的配置解析函数
 * - 为所有配置项提供默认值
 */

/**
 * 解析整数环境变量
 *
 * @param {string} name - 环境变量名称
 * @param {number} fallback - 默认值
 * @returns {number} 解析后的整数值
 */
function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 解析浮点数环境变量
 *
 * @param {string} name - 环境变量名称
 * @param {number} fallback - 默认值
 * @returns {number} 解析后的浮点数值
 */
function parseFloatEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 解析布尔值环境变量
 *
 * 接受的值：'1', 'true', 'yes', 'on'（不区分大小写）
 *
 * @param {string} name - 环境变量名称
 * @param {boolean} fallback - 默认值
 * @returns {boolean} 解析后的布尔值
 */
function parseBoolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

/**
 * 读取配置
 *
 * 从环境变量读取所有配置项，未设置时使用默认值。
 *
 * 环境变量说明：
 * - APP_PORT: HTTP 服务器端口（默认：3000）
 * - WS_PATH: WebSocket 路径（默认：/ws）
 * - CALL_RADIUS: 通话半径（方块距离，默认：10）
 * - PROXIMITY_TICK_MS: 邻近检测间隔（毫秒，默认：250）
 * - GAME_PLAYER_TTL_MS: 玩家数据过期时间（毫秒，默认：10000）
 * - RECONNECT_CODE_TTL_MS: 重连验证码有效期（毫秒，默认：120000）
 * - MCBEWSS_TOKEN: Minecraft 网关认证令牌（默认：空字符串）
 * - DEBUG: 调试模式（默认：false）
 *
 * @returns {Object} 配置对象
 */
function readConfig() {
  return {
    // HTTP 服务器配置
    appPort: parseIntEnv('APP_PORT', 3000),
    wsPath: process.env.WS_PATH || '/ws',

    // 邻近服务配置
    callRadius: parseFloatEnv('CALL_RADIUS', 10),
    proximityTickMs: parseIntEnv('PROXIMITY_TICK_MS', 250),
    gamePlayerTtlMs: parseIntEnv('GAME_PLAYER_TTL_MS', 10_000),

    // 重连验证码配置
    reconnectCodeTtlMs: parseIntEnv('RECONNECT_CODE_TTL_MS', 120_000),

    // 认证和调试配置
    mcToken: process.env.MCBEWSS_TOKEN || '',
    debug: parseBoolEnv('DEBUG', false),
  };
}

module.exports = {
  readConfig,
};

