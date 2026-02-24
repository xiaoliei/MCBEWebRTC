/**
 * 随机验证码生成工具模块
 *
 * 功能概述：
 * - 生成指定位数的随机数字验证码
 * - 自动补零（如生成 3 位验证码时，5 会变成 "005"）
 */

/**
 * 生成指定位数的随机数字验证码
 *
 * @param {number} length - 验证码位数（默认：6）
 * @returns {string} 随机数字字符串，长度为指定位数
 *
 * @example
 * randomDigits(6)  // 可能返回 "123456"
 * randomDigits(4)  // 可能返回 "0042"
 * randomDigits()   // 可能返回 "000001"
 */
function randomDigits(length) {
  const size = Math.max(1, Number.parseInt(length, 10) || 6);
  const max = 10 ** size;
  const value = Math.floor(Math.random() * max);
  return String(value).padStart(size, "0");
}

module.exports = {
  randomDigits,
};
