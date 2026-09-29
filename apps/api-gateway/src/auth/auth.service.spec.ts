import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { DatabaseService } from '@app/database';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('AuthService', () => {
  let service: AuthService;

  const mockDatabaseService = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockJwtService = {
    signAsync: vi.fn().mockResolvedValue('test-token'),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
