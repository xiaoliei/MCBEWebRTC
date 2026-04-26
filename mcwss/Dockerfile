# ==================== 构建阶段 ====================
FROM node:22-alpine AS builder

WORKDIR /app

# --- 编译 shared ---
COPY shared/package.json shared/package-lock.json shared/tsconfig.json ./shared/
RUN cd shared && npm ci
COPY shared/src/ ./shared/src/
RUN cd shared && npm run build

# --- 编译 mcwss ---
COPY mcwss/package.json mcwss/package-lock.json mcwss/tsconfig.json ./mcwss/
RUN cd mcwss && npm ci
COPY mcwss/src/ ./mcwss/src/
RUN cd mcwss && npm run build

# ==================== 生产镜像 ====================
FROM node:22-alpine AS production

WORKDIR /app

# 复制 shared 编译产物
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/package.json

# 复制 mcwss 编译产物和包定义（保持子目录结构以正确解析 file:../shared）
COPY --from=builder /app/mcwss/dist ./mcwss/dist
COPY --from=builder /app/mcwss/package.json ./mcwss/package.json
COPY --from=builder /app/mcwss/package-lock.json ./mcwss/package-lock.json

# 在 mcwss 子目录中安装生产依赖
WORKDIR /app/mcwss
RUN npm ci --omit=dev && npm cache clean --force

ENV NODE_ENV=production

EXPOSE 8000

CMD ["node", "dist/src/main.js"]
