import { BadRequestException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

const COST = 12;

export function assertPasswordLength(password: string): void {
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new BadRequestException('password must be at most 72 UTF-8 bytes');
  }
}

export function hashPassword(password: string): Promise<string> {
  assertPasswordLength(password);
  return hash(password, COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  assertPasswordLength(password);
  return compare(password, passwordHash);
}
