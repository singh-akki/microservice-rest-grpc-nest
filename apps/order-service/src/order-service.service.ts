import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
    OnModuleInit,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { DatabaseService } from '@app/database';
import { OrderStatus } from '@prisma/client';
import { CreateOrderDto } from './dto/create-order.dto.js';

export interface CheckStockResponse {
    available: boolean;
    currentStock: number;
    price: number;
    name: string;
    message: string;
}

export interface ReserveStockResponse {
    success: boolean;
    message: string;
}

export interface ProductGrpcService {
    checkStock(data: { productId: string; quantity: number }): Observable<CheckStockResponse>;
    reserveStock(data: { productId: string; quantity: number }): Observable<ReserveStockResponse>;
}

@Injectable()
export class OrderServiceService implements OnModuleInit {
    private productService!: ProductGrpcService;

    constructor(
        private readonly db: DatabaseService,
        @Inject('PRODUCT_PACKAGE') private readonly client: ClientGrpc,
    ) { }

    onModuleInit() {
        this.productService = this.client.getService<ProductGrpcService>('ProductService');
    }

    async create(dto: CreateOrderDto) {
        // Verify user exists
        const user = await this.db.user.findUnique({
            where: { id: dto.userId },
        });

        if (!user) {
            throw new NotFoundException(`User with ID "${dto.userId}" not found`);
        }

        // 1. gRPC call to ProductService to check stock for each item
        const verifiedItems: {
            productId: string;
            quantity: number;
            price: number;
            name: string;
        }[] = [];

        for (const item of dto.items) {
            let stockCheck: CheckStockResponse;
            try {
                stockCheck = await firstValueFrom(
                    this.productService.checkStock({
                        productId: item.productId,
                        quantity: item.quantity,
                    }),
                );
            } catch (err: any) {
                throw new BadRequestException(
                    `Failed to verify stock with Product Service: ${err?.message ?? 'Service unavailable'}`,
                );
            }

            if (!stockCheck.available) {
                throw new BadRequestException(
                    stockCheck.message || `Item ${item.productId} is not available`,
                );
            }

            verifiedItems.push({
                productId: item.productId,
                quantity: item.quantity,
                price: stockCheck.price,
                name: stockCheck.name,
            });
        }

        // 2. Reserve stock for all items
        for (const item of verifiedItems) {
            const reserveResult = await firstValueFrom(
                this.productService.reserveStock({
                    productId: item.productId,
                    quantity: item.quantity,
                }),
            );

            if (!reserveResult.success) {
                throw new BadRequestException(
                    reserveResult.message || `Failed to reserve stock for ${item.name}`,
                );
            }
        }

        // 3. Calculate total amount
        const total = verifiedItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
        );

        // 4. Save to PostgreSQL in Prisma transaction
        const order = await this.db.order.create({
            data: {
                userId: dto.userId,
                status: OrderStatus.CONFIRMED,
                total,
                items: {
                    create: verifiedItems.map((item) => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        price: item.price,
                    })),
                },
            },
            include: {
                items: true,
            },
        });

        return order;
    }

    async findAll() {
        return this.db.order.findMany({
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
