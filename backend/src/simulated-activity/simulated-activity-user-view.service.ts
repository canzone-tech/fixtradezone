import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { SimulatedActivityPageQueryDto } from './dto/simulated-activity.dto';
import { SimulatedActivityService } from './simulated-activity.service';

interface ActivationRow {
  subscriptionId: string;
  activationLocalDate: string | Date;
}

interface CountRow {
  total: bigint | number | string;
}

@Injectable()
export class SimulatedActivityUserViewService {
  constructor(
    private readonly service: SimulatedActivityService,
    private readonly prisma: PrismaService,
  ) {}

  async getMyActivity(userId: string, query: SimulatedActivityPageQueryDto) {
    const activity = await this.service.getMyActivity(userId, query);
    const activationRows = await this.prisma.$queryRaw<ActivationRow[]>(
      Prisma.sql`
        SELECT subscriptionId, activationLocalDate
        FROM internal_trade_subscription_states
        WHERE userId = ${userId}
      `,
    );

    const activationDateBySubscription = new Map(
      activationRows.map((row) => [
        row.subscriptionId,
        this.localDateString(row.activationLocalDate),
      ]),
    );

    const events = activity.events.filter((event) => {
      const activationLocalDate = activationDateBySubscription.get(
        event.subscriptionId,
      );

      if (!activationLocalDate) {
        return true;
      }

      return this.localDateString(event.localActivityDate) > activationLocalDate;
    });

    const hiddenRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM simulated_trade_activity_events e
      INNER JOIN internal_trade_subscription_states s
        ON s.subscriptionId = e.subscriptionId
      WHERE e.userId = ${userId}
        AND e.scheduledAt <= UTC_TIMESTAMP(3)
        AND e.localActivityDate <= s.activationLocalDate
    `);

    return {
      ...activity,
      events,
      total: Math.max(0, activity.total - this.countNumber(hiddenRows[0]?.total)),
    };
  }

  private localDateString(value: string | Date) {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    return String(value).slice(0, 10);
  }

  private countNumber(value: bigint | number | string | undefined) {
    if (typeof value === 'bigint') {
      return Number(value);
    }

    return Number(value ?? 0);
  }
}
