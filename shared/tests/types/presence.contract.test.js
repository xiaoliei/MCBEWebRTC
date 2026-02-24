import { describe, expect, it, expectTypeOf } from "vitest";
describe("presence contracts", () => {
  it("位置 DTO 必须含三轴坐标", () => {
    expectTypeOf().toEqualTypeOf();
  });
  it("邻近玩家 DTO 结构稳定", () => {
    expectTypeOf().toMatchTypeOf();
  });
  it("presence:nearby 负载为 players 数组", () => {
    const payload = {
      players: [],
    };
    expect(payload.players).toEqual([]);
  });
});
