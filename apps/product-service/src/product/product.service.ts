import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis';
import { Product } from '@prisma/client';

@Injectable()
export class ProductService {
    constructor(
        private readonly db: DatabaseService,
        private readonly redis: RedisService,
    ) { }

    async create(dto: CreateProductDto): Promise<Product> {
        const product = await this.db.product.create({
            data: {
                name: dto.name,
                description: dto.description,
                price: dto.price,
                stock: dto.stock,
                isActive: dto.isActive ?? true,
            },
        });

        // Invalidate list cache
        await this.redis.del('products:all');

        return product;
    }

    async findAll(): Promise<Product[]> {
        const cacheKey = 'products:all';
        const cached = await this.redis.get<Product[]>(cacheKey);
        if (cached) {
            return cached;
        }

        const products = await this.db.product.findMany({
            where: {
                isActive: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        // Cache for 60 seconds
        await this.redis.set(cacheKey, products, 60);

        return products;
    }

    async findOne(id: string, retryCount = 0): Promise<Product | null> {
        const cacheKey = `product:${id}`;

        const cached = await this.redis.get<Product>(cacheKey);
        if (cached) {
            return cached;
        }

        const lockKey = `lock:product:${id}`;
        const lockAcquired = await this.redis.setIfNotExists(
            lockKey,
            '1',
            5,
        );

        if (lockAcquired) {
            try {
                const product = await this.db.product.findUnique({
                    where: { id },
                });

                if (!product) {
                    return null;
                }

                await this.redis.set(cacheKey, product, 300);
                return product;
            } finally {
                await this.redis.del(lockKey);
            }
        }

        // Stampede protection: Retry with backoff up to 3 times, then fallback to DB directly
        if (retryCount >= 3) {
            return this.db.product.findUnique({ where: { id } });
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.findOne(id, retryCount + 1);
    }

    async update(id: string, dto: UpdateProductDto): Promise<Product> {
        const existing = await this.db.product.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Product with ID "${id}" not found`);
        }

        const updated = await this.db.product.update({
            where: { id },
            data: dto,
        });

        // Cache Invalidation
        await this.redis.del(`product:${id}`);
        await this.redis.del('products:all');

        return updated;
    }

    async remove(id: string): Promise<Product> {
        const existing = await this.db.product.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Product with ID "${id}" not found`);
        }

        const deleted = await this.db.product.delete({
            where: { id },
        });

        // Cache Invalidation
        await this.redis.del(`product:${id}`);
        await this.redis.del('products:all');

        return deleted;
    }

    async checkStock(items: { productId: string; quantity: number }[]) {
        const productIds = items.map((i) => i.productId);
        const products = await this.db.product.findMany({
            where: { id: { in: productIds } },
        });

        const productMap = new Map(products.map((p) => [p.id, p]));
        const results = [];
        let allAvailable = true;

        for (const item of items) {
            const product = productMap.get(item.productId);

            if (!product) {
                allAvailable = false;
                results.push({
                    productId: item.productId,
                    available: false,
                    currentStock: 0,
                    price: 0,
                    name: '',
                    message: `Product with ID "${item.productId}" not found`,
                });
                continue;
            }

            if (!product.isActive) {
                allAvailable = false;
                results.push({
                    productId: item.productId,
                    available: false,
                    currentStock: product.stock,
                    price: Number(product.price),
                    name: product.name,
                    message: `Product "${product.name}" is not active`,
                });
                continue;
            }

            if (product.stock < item.quantity) {
                allAvailable = false;
                results.push({
                    productId: item.productId,
                    available: false,
                    currentStock: product.stock,
                    price: Number(product.price),
                    name: product.name,
                    message: `Insufficient stock for "${product.name}": requested ${item.quantity}, available ${product.stock}`,
                });
                continue;
            }

            results.push({
                productId: item.productId,
                available: true,
                currentStock: product.stock,
                price: Number(product.price),
                name: product.name,
                message: 'Stock is available',
            });
        }

        return {
            allAvailable,
            items: results,
        };
    }

    async reserveStock(items: { productId: string; quantity: number }[]) {
        try {
            await this.db.$transaction(async (tx) => {
                for (const item of items) {
                    const result = await tx.product.updateMany({
                        where: {
                            id: item.productId,
                            isActive: true,
                            stock: {
                                gte: item.quantity,
                            },
                        },
                        data: {
                            stock: {
                                decrement: item.quantity,
                            },
                        },
                    });

                    if (result.count === 0) {
                        throw new Error(
                            `Insufficient stock or inactive product: ${item.productId}`,
                        );
                    }
                }
            });

            // Invalidate cache for all affected products
            for (const item of items) {
                await this.redis.del(`product:${item.productId}`);
            }
            await this.redis.del('products:all');

            return {
                success: true,
                message: 'Stock successfully reserved',
                failedProductId: '',
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to reserve stock',
                failedProductId: '',
            };
        }
    }

    async releaseStock(items: { productId: string; quantity: number }[]) {
        try {
            await this.db.$transaction(async (tx) => {
                for (const item of items) {
                    await tx.product.updateMany({
                        where: { id: item.productId },
                        data: {
                            stock: {
                                increment: item.quantity,
                            },
                        },
                    });
                }
            });

            // Invalidate cache for all affected products
            for (const item of items) {
                await this.redis.del(`product:${item.productId}`);
            }
            await this.redis.del('products:all');

            return {
                success: true,
                message: 'Stock successfully released',
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to release stock',
            };
        }
    }
}
