'use client';

export function setToken(token: string) {
  // Store in cookie so middleware can read it (localStorage is not accessible in middleware)
  document.cookie = `token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
  localStorage.setItem('token', token);
}

export function clearToken() {
  document.cookie = 'token=; path=/; max-age=0';
  localStorage.removeItem('token');
}

export function getToken(): string | null {
  return localStorage.getItem('token');
}
