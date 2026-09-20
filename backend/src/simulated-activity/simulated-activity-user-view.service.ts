import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { SimulatedActivityPageQueryDto } from './dto/simulated-activity.dto';
import { SimulatedActivityService } from './simulated-activity.service';

interface ActivationRow {
  subscriptionId: string;
  activationLocalDate: string | Date;
  rewardStartMode: string;
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
        SELECT
          s.subscriptionId,
          s.activationLocalDate,
          ups.rewardStartMode
        FROM internal_trade_subscription_states s
        INNER JOIN user_package_subscriptions ups
          ON ups.id = s.subscriptionId
        WHERE s.userId = ${userId}
      `,
    );

    const activationBySubscription = new Map(
      activationRows.map((row) => [
        row.subscriptionId,
        {
          activationLocalDate: this.localDateString(row.activationLocalDate),
          rewardStartMode: row.rewardStartMode,
        },
      ]),
    );

    const events = activity.events.filter((event) => {
      const activation = activationBySubscription.get(event.subscriptionId);

      if (!activation || activation.rewardStartMode !== 'NEXT_CALENDAR_DAY') {
        return true;
      }

      return (
        this.localDateString(event.localActivityDate) >
        activation.activationLocalDate
      );
    });

    const hiddenRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM simulated_trade_activity_events e
      INNER JOIN internal_trade_subscription_states s
        ON s.subscriptionId = e.subscriptionId
      INNER JOIN user_package_subscriptions ups
        ON ups.id = e.subscriptionId
      WHERE e.userId = ${userId}
        AND ups.rewardStartMode = 'NEXT_CALENDAR_DAY'
        AND e.scheduledAt <= UTC_TIMESTAMP(3)
        AND e.localActivityDate <= s.activationLocalDate
    `);

    return {
      ...activity,
      events,
      total: Math.max(
        0,
        activity.total - this.countNumber(hiddenRows[0]?.total),
      ),
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
