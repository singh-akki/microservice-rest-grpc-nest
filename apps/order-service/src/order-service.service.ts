import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    OnModuleInit,
} from '@nestjs/common';
import type { ClientGrpc, ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis';
import { Order, OrderStatus } from '@prisma/client';
import { CreateOrderDto } from './dto/create-order.dto.js';

export interface StockItem {
    productId: string;
    quantity: number;
}

export interface ItemStockStatus {
    productId: string;
    available: boolean;
    currentStock: number;
    price: number;
    name: string;
    message: string;
}

export interface CheckStockResponse {
    allAvailable: boolean;
    items: ItemStockStatus[];
}

export interface ReserveStockResponse {
    success: boolean;
    message: string;
    failedProductId: string;
}

export interface ReleaseStockResponse {
    success: boolean;
    message: string;
}

export interface ProductGrpcService {
    checkStock(data: { items: StockItem[] }): Observable<CheckStockResponse>;
    reserveStock(data: { items: StockItem[] }): Observable<ReserveStockResponse>;
    releaseStock(data: { items: StockItem[] }): Observable<ReleaseStockResponse>;
}

@Injectable()
export class OrderServiceService implements OnModuleInit {
    private readonly logger = new Logger(OrderServiceService.name);
    private productService!: ProductGrpcService;

    constructor(
        private readonly db: DatabaseService,
        private readonly redis: RedisService,
        @Inject('PRODUCT_PACKAGE') private readonly client: ClientGrpc,
        @Inject('RABBITMQ_SERVICE') private readonly rabbitClient: ClientProxy,
    ) { }

    onModuleInit() {
        this.productService = this.client.getService<ProductGrpcService>('ProductService');
    }

    async create(dto: CreateOrderDto): Promise<Order> {
        const idempotencyKey = dto.idempotencyKey;
        const lockKey = idempotencyKey ? `idempotency:lock:${idempotencyKey}` : null;
        const resultKey = idempotencyKey ? `idempotency:order:${idempotencyKey}` : null;

        // 1. Idempotency Check (Duplicate Requests)
        if (idempotencyKey && resultKey && lockKey) {
            const cachedOrder = await this.redis.get<Order>(resultKey);
            if (cachedOrder) {
                this.logger.log(`Returning idempotent cached order for key: ${idempotencyKey}`);
                return cachedOrder;
            }

            const acquired = await this.redis.setIfNotExists(lockKey, '1', 60);
            if (!acquired) {
                throw new ConflictException(
                    'An order with this idempotency key is currently being processed. Please wait.',
                );
            }
        }

        try {
            return await this.executeCreateOrder(dto, idempotencyKey, resultKey);
        } catch (error) {
            // If processing failed, release the lock so the customer can retry
            if (lockKey) {
                await this.redis.del(lockKey);
            }
            throw error;
        }
    }

    private async executeCreateOrder(
        dto: CreateOrderDto,
        idempotencyKey?: string,
        resultKey?: string | null,
    ): Promise<Order> {
        // 2. Validate User Existence
        const user = await this.db.user.findUnique({
            where: { id: dto.userId },
        });

        if (!user) {
            throw new NotFoundException(`User with ID "${dto.userId}" not found`);
        }

        // 3. Deduplicate Product IDs in Single Order
        // Merges quantities if the same product is passed multiple times
        const mergedItemsMap = new Map<string, number>();
        for (const item of dto.items) {
            const current = mergedItemsMap.get(item.productId) ?? 0;
            mergedItemsMap.set(item.productId, current + item.quantity);
        }

        const normalizedItems: StockItem[] = Array.from(mergedItemsMap.entries()).map(
            ([productId, quantity]) => ({
                productId,
                quantity,
            }),
        );

        // 4. Batch Stock Check via gRPC
        let checkResult: CheckStockResponse;
        try {
            checkResult = await firstValueFrom(
                this.productService.checkStock({ items: normalizedItems }),
            );
        } catch (err: any) {
            throw new BadRequestException(
                `Failed to communicate with Product Service: ${err?.message ?? 'Service unavailable'}`,
            );
        }

        if (!checkResult.allAvailable) {
            const unavailable = checkResult.items.filter((i) => !i.available);
            const messages = unavailable.map((i) => i.message).join('; ');
            throw new BadRequestException(`Order cannot be placed: ${messages}`);
        }

        const priceMap = new Map(
            checkResult.items.map((i) => [i.productId, i.price]),
        );

        // 5. Atomic Batch Stock Reservation via gRPC (Concurrency & Partial Failure Protection)
        let reserveResult: ReserveStockResponse;
        try {
            reserveResult = await firstValueFrom(
                this.productService.reserveStock({ items: normalizedItems }),
            );
        } catch (err: any) {
            throw new BadRequestException(
                `Stock reservation failed: ${err?.message ?? 'Service unavailable'}`,
            );
        }

        if (!reserveResult.success) {
            throw new BadRequestException(
                reserveResult.message || 'Failed to reserve stock for items',
            );
        }

        // 6. Calculate total price
        const total = normalizedItems.reduce((sum, item) => {
            const price = priceMap.get(item.productId) ?? 0;
            return sum + price * item.quantity;
        }, 0);

        // 7. Persist Order to PostgreSQL with SAGA Compensation on Failure
        let order: Order;
        try {
            order = await this.db.order.create({
                data: {
                    userId: dto.userId,
                    status: OrderStatus.CONFIRMED,
                    total,
                    items: {
                        create: normalizedItems.map((item) => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            price: priceMap.get(item.productId) ?? 0,
                        })),
                    },
                },
                include: {
                    items: true,
                },
            });
        } catch (dbError: any) {
            // CRITICAL: Database failure after stock was reserved -> COMPENSATE by releasing stock
            this.logger.error(
                `PostgreSQL order creation failed: ${dbError.message}. Initiating stock release compensation...`,
            );

            try {
                await firstValueFrom(
                    this.productService.releaseStock({ items: normalizedItems }),
                );
                this.logger.log('Stock successfully released after order DB error.');
            } catch (compensationError: any) {
                this.logger.error(
                    `CRITICAL SAGA FAILURE: Failed to release stock after order failure: ${compensationError.message}`,
                );
            }

            throw new InternalServerErrorException(
                'Failed to record order in database. Any reserved stock has been safely released.',
            );
        }

        // 8. Cache idempotent result (24h TTL) & clean up lock
        if (idempotencyKey && resultKey) {
            await this.redis.set(resultKey, order, 86400);
            await this.redis.del(`idempotency:lock:${idempotencyKey}`);
        }

        // 9. Publish order.created event asynchronously to RabbitMQ
        try {
            this.rabbitClient.emit('order.created', {
                orderId: order.id,
                userId: order.userId,
                userEmail: user.email,
                userName: user.name,
                total: Number(order.total),
                items: normalizedItems.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    price: priceMap.get(item.productId) ?? 0,
                })),
                createdAt: order.createdAt.toISOString(),
            });
            this.logger.log(`Published order.created event for orderId: ${order.id}`);
        } catch (publishError: any) {
            this.logger.warn(
                `Failed to emit order.created event for order ${order.id}: ${publishError.message}`,
            );
        }

        return order;
    }

    async findAll(userId?: string) {
        return this.db.order.findMany({
            where: userId ? { userId } : undefined,
            include: {
                items: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async findOne(id: string) {
        const order = await this.db.order.findUnique({
            where: { id },
            include: {
                items: true,
            },
        });

        if (!order) {
            throw new NotFoundException(`Order with ID "${id}" not found`);
        }

        return order;
    }
}
