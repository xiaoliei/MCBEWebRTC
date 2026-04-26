# ==================== 构建阶段 ====================
FROM node:22-alpine AS builder

WORKDIR /app

# --- 编译 shared ---
# 先复制 shared 的包定义文件，利用 Docker 层缓存
COPY shared/package.json shared/package-lock.json shared/tsconfig.json ./shared/
# 安装 shared 编译所需的 devDependencies
RUN cd shared && npm ci
# 复制 shared 源码并编译
COPY shared/src/ ./shared/src/
RUN cd shared && npm run build

# --- 编译 backend ---
# 先复制 backend 的包定义文件，利用 Docker 层缓存
COPY backend/package.json backend/package-lock.json backend/tsconfig.json ./backend/
# 安装 backend 全部依赖（含 file:../shared 的符号链接解析）
RUN cd backend && npm ci
# 复制 backend 源码并编译
COPY backend/src/ ./backend/src/
RUN cd backend && npm run build

# ==================== 生产镜像 ====================
FROM node:22-alpine AS production

WORKDIR /app

# 复制 shared 编译产物（运行时仅需 dist/ 和 package.json）
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/package.json

# 复制 backend 编译产物和包定义（保持子目录结构以正确解析 file:../shared）
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/backend/package-lock.json ./backend/package-lock.json

# 在 backend 子目录中安装生产依赖
WORKDIR /app/backend
RUN npm ci --omit=dev && npm cache clean --force

# 设置环境变量
ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "dist/src/server.js"]
