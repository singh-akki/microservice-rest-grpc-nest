import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    Headers,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @RateLimit({
        limit: 20,
        windowSeconds: 60,
    })
    @Post()
    async create(
        @CurrentUser() user: AuthenticatedUser,
        @Body() dto: CreateOrderDto,
        @Headers('idempotency-key') idempotencyKey?: string,
    ) {
        // Authenticated user identity is strictly enforced:
        // Client-supplied userId (if any) is ignored; only user.userId from JWT is used.
        return this.ordersService.create(user.userId, dto, idempotencyKey);
    }

    @RateLimit({
        limit: 60,
        windowSeconds: 60,
    })
    @Get()
    async findAll(
        @CurrentUser() user: AuthenticatedUser,
        @Query('userId') queryUserId?: string,
    ) {
        // Authorization:
        // If user is ADMIN, they may view all orders or filter by queryUserId.
        // If regular USER, they can ONLY view their own orders regardless of query params.
        const targetUserId =
            user.role === 'ADMIN' ? queryUserId : user.userId;

        return this.ordersService.findAll(targetUserId);
    }

    @RateLimit({
        limit: 60,
        windowSeconds: 60,
    })
    @Get(':id')
    async findOne(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id') id: string,
    ) {
        const order = await this.ordersService.findOne(id);

        // Authorization: Regular users can only access their own orders
        if (user.role !== 'ADMIN' && order.userId !== user.userId) {
            throw new ForbiddenException(
                'You do not have permission to access this order',
            );
        }

        return order;
    }
}
