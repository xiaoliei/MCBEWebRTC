// 中文注释：Token 存储模块，使用 localStorage 封装，持久化玩家 JWT。
const TOKEN_KEY = 'mcbe_player_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
