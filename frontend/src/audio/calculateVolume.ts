/** 默认参考距离，距离 <= 此值时音量为最大值 */
const DEFAULT_REFERENCE_DISTANCE = 2.0;

/**
 * 根据距离计算音量衰减值（1/r 反比例曲线）
 * @param distance 本玩家与目标玩家的 3D 欧几里得距离
 * @param referenceDistance 参考距离，默认 2.0，距离 <= 此值时音量截断到 1.0
 * @returns 音量值，范围 [0, 1]
 */
export function calculateVolume(
  distance: number,
  referenceDistance: number = DEFAULT_REFERENCE_DISTANCE
): number {
  if (distance <= 0 || referenceDistance <= 0) {
    return 1.0;
  }
  return Math.min(1.0, referenceDistance / distance);
}
