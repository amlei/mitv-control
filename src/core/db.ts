// Prisma 单例（懒加载；测试可用 DATABASE_URL 指向独立库）
import { PrismaClient } from '../generated/prisma';

let impl: PrismaClient | null = null;

export function db(): PrismaClient {
  impl ??= new PrismaClient();
  return impl;
}
