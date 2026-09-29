import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit {
  constructor(@Optional() private readonly configService?: ConfigService) {
    const connectionString =
      configService?.get<string>('DATABASE_URL') ??
      process.env['DATABASE_URL'] ??
      '';
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}

