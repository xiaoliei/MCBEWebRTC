/**
 * ICE 服务器配置模块
 *
 * 功能概述：
 * - 从环境变量读取 STUN/TURN 服务器配置
 * - 支持通过 JSON 环境变量直接配置
 * - 支持通过单独的环境变量配置 STUN 和 TURN 服务器
 *
 * ICE (Interactive Connectivity Establishment) 用于 WebRTC NAT 穿透：
 * - STUN 服务器：帮助客户端发现公网 IP 和端口
 * - TURN 服务器：在直接连接失败时提供中继服务
 */

/**
 * 从环境变量获取 ICE 服务器配置
 *
 * 优先级：
 * 1. ICE_SERVERS_JSON（JSON 数组格式）
 * 2. STUN_URLS + TURN_URL（单独配置）
 *
 * 环境变量说明：
 * - ICE_SERVERS_JSON: 完整的 ICE 服务器配置 JSON 数组
 * - STUN_URLS: STUN 服务器 URL 列表，逗号分隔（默认：stun:stun.l.google.com:19302）
 * - TURN_URL: TURN 服务器 URL
 * - TURN_USERNAME: TURN 服务器用户名
 * - TURN_CREDENTIAL: TURN 服务器密码
 *
 * @returns {Array} ICE 服务器配置数组
 *
 * @example
 * // 使用 ICE_SERVERS_JSON
 * ICE_SERVERS_JSON='[{"urls":"stun:stun.l.google.com:19302"}]'
 *
 * // 使用单独的环境变量
 * STUN_URLS='stun:stun1.example.com:3478,stun:stun2.example.com:3478'
 * TURN_URL='turn:turn.example.com:3478'
 * TURN_USERNAME='user'
 * TURN_CREDENTIAL='pass'
 */
function getIceServersFromEnv() {
  // 优先使用 JSON 格式的配置
  const rawJson = process.env.ICE_SERVERS_JSON;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }

  const servers = [];

  // 配置 STUN 服务器
  const stunUrls = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (stunUrls.length) servers.push({ urls: stunUrls });

  // 配置 TURN 服务器
  const turnUrl = (process.env.TURN_URL || '').trim();
  if (turnUrl) {
    const username = process.env.TURN_USERNAME || '';
    const credential = process.env.TURN_CREDENTIAL || '';
    servers.push({
      urls: [turnUrl],
      username,
      credential,
    });
  }

  return servers;
}

module.exports = {
  getIceServersFromEnv,
};

