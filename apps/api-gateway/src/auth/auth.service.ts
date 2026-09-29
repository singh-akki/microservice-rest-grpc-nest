import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { DatabaseService } from '@app/database';
import { Role } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { randomBytes, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly database: DatabaseService,
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
    ) { }
    async register(dto: RegisterDto) {
        const email = dto.email.trim().toLowerCase();

        const existingUser = await this.database.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw new ConflictException('Email is already registered');
        }

        const passwordHash = await argon2.hash(dto.password);

        const user = await this.database.user.create({
            data: {
                name: dto.name.trim(),
                email,
                passwordHash,
                // Role defaults to USER in the database.
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
            },
        });

        return {
            message: 'Registration successful',
            user,
        };
    }
    async login(dto: LoginDto) {
        const email = dto.email.trim().toLowerCase();

        const user = await this.database.user.findUnique({
            where: { email },
        });

        if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
            throw new UnauthorizedException('Invalid email or password');
        }

        const accessToken = await this.createAccessToken(user);

        const refreshToken = await this.createRefreshSession(user.id);

        return {
            accessToken,
            refreshToken,
            tokenType: 'Bearer',
            expiresIn: '15m',
        };
    }
    async refresh(refreshToken: string) {
        const payload = await this.verifyRefreshToken(refreshToken);

        const session = await this.database.refreshSession.findUnique({
            where: {
                id: payload.jti,
            },
            include: {
                user: true,
            },
        });

        if (!session) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const validToken = await argon2.verify(
            session.tokenHash,
            refreshToken,
        );

        if (!validToken) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        // Reuse detection: A valid token was presented, but its session was already revoked.
        // This indicates a replay attack / stolen token reuse after legitimate rotation.
        if (session.revokedAt) {
            this.logger.warn(
                `Refresh token reuse detected for user ${session.userId}. Revoking all sessions.`,
            );

            // Invalidate ALL sessions for this user across all devices
            await this.logoutAll(session.userId);

            throw new UnauthorizedException(
                'Invalid refresh token: token reuse detected. All sessions have been terminated for security.',
            );
        }

        if (session.expiresAt <= new Date()) {
            throw new UnauthorizedException('Refresh token has expired');
        }

        const user = session.user;

        // Revoke the old session.
        await this.database.refreshSession.update({
            where: {
                id: session.id,
            },
            data: {
                revokedAt: new Date(),
            },
        });

        // Generate new tokens.
        const accessToken = await this.createAccessToken(user);

        const newRefreshToken = await this.createRefreshSession(user.id);

        return {
            accessToken,
            refreshToken: newRefreshToken,
            tokenType: 'Bearer',
            expiresIn: '15m',
        };
    }
    async logout(refreshToken: string) {
        const payload = await this.verifyRefreshToken(refreshToken);

        await this.database.refreshSession.updateMany({
            where: {
                id: payload.jti,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
            },
        });

        return {
            message: 'Logged out successfully',
        };
    }
    async logoutAll(userId: string) {
        await this.database.refreshSession.updateMany({
            where: {
                userId,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
            },
        });

        return {
            message: 'Logged out from all devices',
        };
    }

    private async createRefreshSession(userId: string) {
        const sessionId = randomUUID();

        const refreshToken = await this.jwtService.signAsync(
            {
                sub: userId,
                jti: sessionId,
            },
            {
                secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
                expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
                    '7d') as any,
            },
        );

        const tokenHash = await argon2.hash(refreshToken);

        const expiresAt = new Date();

        expiresAt.setDate(expiresAt.getDate() + 7);

        await this.database.refreshSession.create({
            data: {
                id: sessionId,
                userId,
                tokenHash,
                expiresAt,
            },
        });

        return refreshToken;
    }
    private async createAccessToken(user: {
        id: string;
        email: string;
        role: Role;
    }) {
        return this.jwtService.signAsync(
            {
                sub: user.id,
                email: user.email,
                role: user.role,
            },
            {
                secret: this.config.getOrThrow<string>('JWT_SECRET'),
                expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ?? '15m') as any,
            },
        );
    }
    private async verifyRefreshToken(refreshToken: string) {
        try {
            return await this.jwtService.verifyAsync<{
                sub: string;
                jti: string;
            }>(refreshToken, {
                secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
            });
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }
    private generateRefreshToken(): string {
        return randomBytes(64).toString('hex');
    }
    private async hashRefreshToken(token: string): Promise<string> {
        return argon2.hash(token);
    }
}
