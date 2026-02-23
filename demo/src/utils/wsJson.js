/**
 * WebSocket JSON 工具模块
 *
 * 功能概述：
 * - 安全的 JSON 解析（避免异常）
 * - 安全的 WebSocket 消息发送（检查连接状态）
 */

const { WebSocket } = require('ws');

/**
 * 尝试解析 JSON 字符串
 *
 * 使用 Result 模式返回解析结果，避免 try-catch 嵌套。
 *
 * @param {string} raw - JSON 字符串
 * @returns {{ok: true, value: any}|{ok: false, error: Error}} 解析结果
 */
function tryParseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * 安全地向 WebSocket 发送 JSON 消息
 *
 * 在发送前检查连接状态，避免向已关闭的连接发送消息。
 *
 * @param {WebSocket} socket - WebSocket 连接
 * @param {Object} message - 要发送的消息对象
 * @returns {boolean} 是否发送成功
 */
function safeSend(socket, message) {
  if (!socket) return false;
  if (socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  tryParseJson,
  safeSend,
};

