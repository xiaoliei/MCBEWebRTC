import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

type PackageExports = Record<
  string,
  {
    types?: string;
    import?: string;
  }
>;

const testDir = dirname(fileURLToPath(import.meta.url));
const sharedRoot = resolve(testDir, "../..");
const packageJsonPath = resolve(sharedRoot, "package.json");
const packageJson = JSON.parse(
  readFileSync(packageJsonPath, "utf8"),
) as {
  name: string;
  exports: PackageExports;
};

function resolveTypeEntry(subpath: "."): string {
  const entry = packageJson.exports[subpath];
  if (!entry?.types) {
    throw new Error(`缺少 ${subpath} 的 types 导出配置`);
  }

  // 强制使用 dist，不存在则测试失败，确保导出契约的真实性
  const preferredPath = resolve(sharedRoot, entry.types);
  if (!existsSync(preferredPath)) {
    throw new Error(`dist 类型文件不存在: ${preferredPath}，请先运行 npm run build`);
  }
  return preferredPath;
}

function compileTypeSnippet(sourceText: string): ts.Diagnostic[] {
  const tempDir = mkdtempSync(join(tmpdir(), "shared-signaling-typecheck-"));
  const filePath = join(tempDir, "typecheck.ts");

  try {
    writeFileSync(filePath, sourceText, "utf8");

    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      baseUrl: sharedRoot,
      // 仅支持根导入
      paths: {
        [packageJson.name]: [resolveTypeEntry(".")],
      },
    };

    const program = ts.createProgram([filePath], compilerOptions);
    return ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function formatDiagnostics(diagnostics: ts.Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return "";
  }

  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => sharedRoot,
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => "\n",
  });
}

describe("signaling 类型导出", () => {
  it("package exports 配置仅包含根导出，不包含子路径通配符", () => {
    const rootExport = packageJson.exports["."];
    const wildcardExport = packageJson.exports["./types/*"];

    expect(packageJson.name).toBe("@mcbewebrtc/shared");
    expect(rootExport?.types).toBe("./dist/index.d.ts");
    expect(rootExport?.import).toBe("./dist/index.js");
    // 子路径通配符导出应已移除
    expect(wildcardExport).toBeUndefined();
  });

  it("shared 根导出可被 mcwss 场景消费", () => {
    const diagnostics = compileTypeSnippet(`
      import type {
        BridgePositionUpdatePayload,
        ClientToServerEvents,
        ConnectedPayload,
        PositionDto,
        PresenceNearbyEventPayload,
        ServerToClientEvents
      } from "@mcbewebrtc/shared";

      const position: PositionDto = { x: 0, y: 64, z: 0 };
      const bridgePayload: BridgePositionUpdatePayload = {
        playerName: "Steve",
        playerId: null,
        position,
        dim: 0,
      };

      type BridgeUpdateEvent = ClientToServerEvents["bridge:position:update"];
      type ConnectedEvent = ServerToClientEvents["connected"];
      type NearbyEvent = ServerToClientEvents["presence:nearby"];

      const connectedPayload: ConnectedPayload = {
        sessionId: "s-1",
        playerName: "Steve",
      };

      const nearbyPayload: PresenceNearbyEventPayload = { players: [] };

      const bridgeEvent: BridgeUpdateEvent = (_payload) => {};
      const connectedEvent: ConnectedEvent = (_payload) => {};
      const nearbyEvent: NearbyEvent = (_payload) => {};

      bridgeEvent(bridgePayload);
      connectedEvent(connectedPayload);
      nearbyEvent(nearbyPayload);
    `);

    expect(diagnostics, formatDiagnostics(diagnostics)).toHaveLength(0);
  });

  it("shared 根导出可被 backend 场景消费（所有 signaling 类型）", () => {
    const diagnostics = compileTypeSnippet(`
      import type {
        BridgePositionUpdatePayload,
        ClientJoinPayload,
        ConnectDeniedPayload,
        ConnectDeniedReason,
        ConnectedPayload,
        PresenceListResponsePayload,
        PresenceNearbyEventPayload,
        WebRtcSignalPayload,
        WebRtcSignalRelayPayload
      } from "@mcbewebrtc/shared";

      const reason: ConnectDeniedReason = "TOKEN_INVALID";
      const deniedPayload: ConnectDeniedPayload = { reason };
      const joinPayload: ClientJoinPayload = { playerName: "Alex" };
      const bridgePayload: BridgePositionUpdatePayload = {
        playerName: "Alex",
        playerId: null,
        position: { x: 1, y: 2, z: 3 },
        dim: 1,
      };
      const offerPayload: WebRtcSignalPayload = {
        toSessionId: "to-1",
        data: { sdp: "offer" },
      };
      const relayPayload: WebRtcSignalRelayPayload = {
        fromSessionId: "from-1",
        data: { sdp: "answer" },
      };
      const connectedPayload: ConnectedPayload = {
        sessionId: "s-2",
        playerName: "Alex",
      };
      const nearbyPayload: PresenceNearbyEventPayload = { players: [] };
      const listPayload: PresenceListResponsePayload = { players: [] };

      void deniedPayload;
      void joinPayload;
      void bridgePayload;
      void offerPayload;
      void relayPayload;
      void connectedPayload;
      void nearbyPayload;
      void listPayload;
    `);

    expect(diagnostics, formatDiagnostics(diagnostics)).toHaveLength(0);
  });
});
