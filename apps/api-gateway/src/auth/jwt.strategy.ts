import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { Role } from '@prisma/client';

export interface JwtPayload {
    sub: string;
    email: string;
    role: Role;
}

export interface AuthenticatedUser {
    userId: string;
    email: string;
    role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(config: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
        });
    }

    async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
        return {
            userId: payload.sub,
            email: payload.email,
            role: payload.role,
        };
    }
}