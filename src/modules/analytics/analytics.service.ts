import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../roles/user-role.enum';
import { UserStatus } from '../users/entities/user.entity';

export interface AnalyticsSummary {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: {
      customer: number;
      staff: number;
      inventoryManager: number;
      admin: number;
    };
  };
  audit: {
    totalLogs: number;
    recentActionsCount: number;
  };
  system: {
    ordersCount: number;
    productsCount: number;
  };
}

interface UserRoleCountRow {
  role: UserRole;
  status: UserStatus;
  count: number | string;
}

interface CountRow {
  count: number | string;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly dataSource: DataSource) {}

  private async queryCount(sql: string): Promise<number> {
    try {
      const rows = await this.dataSource.query<CountRow[]>(sql);
      return Number(rows[0]?.count) || 0;
    } catch {
      return 0;
    }
  }

  async getSummary(): Promise<AnalyticsSummary> {
    // Aggregated user metrics
    const userRoleCounts = await this.dataSource.query<UserRoleCountRow[]>(
      `SELECT "role", "status", COUNT(*)::int AS "count"
       FROM "users"
       GROUP BY "role", "status"`,
    );

    let totalUsers = 0;
    let activeUsers = 0;
    let inactiveUsers = 0;
    const byRole = {
      customer: 0,
      staff: 0,
      inventoryManager: 0,
      admin: 0,
    };

    for (const row of userRoleCounts) {
      const count = Number(row.count) || 0;
      totalUsers += count;
      if (row.status === UserStatus.ACTIVE) {
        activeUsers += count;
      } else {
        inactiveUsers += count;
      }

      if (row.role === UserRole.CUSTOMER) {
        byRole.customer += count;
      } else if (row.role === UserRole.STAFF) {
        byRole.staff += count;
      } else if (row.role === UserRole.INVENTORY_MANAGER) {
        byRole.inventoryManager += count;
      } else if (row.role === UserRole.ADMIN) {
        byRole.admin += count;
      }
    }

    // Total audit logs
    const totalLogs = await this.queryCount(
      `SELECT COUNT(*)::int AS "count" FROM "audit_logs"`,
    );

    // Recent 24h audit count
    const recentActionsCount = await this.queryCount(
      `SELECT COUNT(*)::int AS "count" FROM "audit_logs"
       WHERE "created_at" >= NOW() - INTERVAL '24 hours'`,
    );

    // Operational summary
    const ordersCount = await this.queryCount(
      `SELECT COUNT(*)::int AS "count" FROM "orders"`,
    );

    const productsCount = await this.queryCount(
      `SELECT COUNT(*)::int AS "count" FROM "products"`,
    );

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        byRole,
      },
      audit: {
        totalLogs,
        recentActionsCount,
      },
      system: {
        ordersCount,
        productsCount,
      },
    };
  }
}
