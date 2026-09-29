import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard';
import { AuthenticatedUser } from './jwt.strategy';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';

interface AuthenticatedRequest extends Request {
    user: AuthenticatedUser;
}

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @UseGuards(RateLimitGuard)
    @RateLimit({
        limit: 5,
        windowSeconds: 60,
    })
    @Post('login')
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }
    @Post('refresh')
    refresh(@Body() dto: RefreshTokenDto) {
        return this.authService.refresh(dto.refreshToken);
    }

    @Post('logout')
    logout(@Body() dto: RefreshTokenDto) {
        return this.authService.logout(dto.refreshToken);
    }

    @Post('logout-all')
    @UseGuards(JwtAuthGuard)
    logoutAll(@Req() request: AuthenticatedRequest) {
        return this.authService.logoutAll(request.user.userId);
    }
}
