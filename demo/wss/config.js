/**
 * Minecraft 网关配置管理模块
 *
 * 功能概述：
 * - 从环境变量读取网关配置
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
  if (raw == null || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
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
  if (raw == null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

/**
 * 读取网关配置
 *
 * 从环境变量读取所有配置项，未设置时使用默认值。
 *
 * 环境变量说明：
 * - GATEWAY_PORT: 网关监听端口（默认：8000）
 * - SIGNALING_URL: 主服务器 WebSocket URL（默认：ws://localhost:3000/ws）
 * - MCBEWSS_TOKEN: 认证令牌（默认：空字符串）
 * - DEBUG: 调试模式（默认：false）
 *
 * @returns {Object} 配置对象
 */
function readConfig() {
  return {
    // 网关监听端口
    port: parseIntEnv("GATEWAY_PORT", 8000),
    // 主服务器信令 URL
    signalingUrl: process.env.SIGNALING_URL || "ws://localhost:3000/ws",
    // 认证令牌（必须与主服务器配置一致）
    mcToken: process.env.MCBEWSS_TOKEN || "",
    // 调试模式
    debug: parseBoolEnv("DEBUG", false),
  };
}

module.exports = {
  readConfig,
};
