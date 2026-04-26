# ==================== 构建阶段 ====================
FROM node:22-alpine AS builder

WORKDIR /app

# --- 编译 shared ---
COPY shared/package.json shared/package-lock.json shared/tsconfig.json ./shared/
RUN cd shared && npm ci
COPY shared/src/ ./shared/src/
RUN cd shared && npm run build

# --- 编译 frontend ---
COPY frontend/package.json frontend/package-lock.json frontend/tsconfig.json ./frontend/
# Vite 配置文件
COPY frontend/vite.config.ts ./frontend/
RUN cd frontend && npm ci
COPY frontend/src/ ./frontend/src/
# 复制前端入口 HTML
COPY frontend/index.html ./frontend/
RUN cd frontend && npm run build

# ==================== 生产镜像 ====================
FROM nginx:alpine AS production

# 复制 nginx 配置
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# 复制 Vite 构建产物
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
