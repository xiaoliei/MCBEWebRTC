/**
 * 类型定义
 * 从 shared 包导入共享类型，确保与 backend/frontend 的类型一致性
 */

// 从 shared 包导入所有 signaling 相关类型
export type {
  BridgePositionUpdatePayload,
  PositionDto,
  ClientToServerEvents,
  ServerToClientEvents
} from '@mcbewss/shared';
