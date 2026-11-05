import type { Minutes } from './types';

export const hm = (h: number, m: number): Minutes => h * 60 + m;
export const fmt = (t: Minutes): string =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
