import {
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    Patch,
    Post,
} from '@nestjs/common';
import {
    GrpcMethod,
    RpcException,
} from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Product } from '@prisma/client';
import { ProductService } from './product.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Controller('products')
export class ProductController {

    constructor(private readonly productService: ProductService) { }

    private mapProduct(product: Product) {
        return {
            id: product.id,
            name: product.name,
            description: product.description ?? '',
            price: Number(product.price),
            stock: product.stock,
            isActive: product.isActive,
            createdAt: product.createdAt.toISOString(),
            updatedAt: product.updatedAt.toISOString(),
        };
    }

    @Post()
    create(@Body() dto: CreateProductDto) {
        return this.productService.create(dto);
    }

    @Get()
    findAll() {
        return this.productService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.productService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
        return this.productService.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.productService.remove(id);
    }

    @GrpcMethod('ProductService', 'FindAll')
    async grpcFindAll() {
        const products = await this.productService.findAll();
        return {
            products: products.map((p) => this.mapProduct(p)),
        };
    }

    @GrpcMethod('ProductService', 'FindOne')
    async grpcFindOne(data: { id: string }) {
        const product = await this.productService.findOne(data.id);
        if (!product) {
            throw new RpcException({
                code: status.NOT_FOUND,
                message: `Product with ID "${data.id}" not found`,
            });
        }
        return this.mapProduct(product);
    }

    @GrpcMethod('ProductService', 'Create')
    async grpcCreate(data: CreateProductDto) {
        const product = await this.productService.create(data);
        return this.mapProduct(product);
    }

    @GrpcMethod('ProductService', 'Update')
    async grpcUpdate(data: UpdateProductDto & { id: string }) {
        const { id, ...dto } = data;
        try {
            const product = await this.productService.update(id, dto);
            return this.mapProduct(product);
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw new RpcException({
                    code: status.NOT_FOUND,
                    message: error.message,
                });
            }
            throw error;
        }
    }

    @GrpcMethod('ProductService', 'Remove')
    async grpcRemove(data: { id: string }) {
        try {
            const product = await this.productService.remove(data.id);
            return this.mapProduct(product);
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw new RpcException({
                    code: status.NOT_FOUND,
                    message: error.message,
                });
            }
            throw error;
        }
    }

    @GrpcMethod('ProductService', 'CheckStock')
    async grpcCheckStock(data: { productId: string; quantity: number }) {
        return this.productService.checkStock(data.productId, data.quantity);
    }

    @GrpcMethod('ProductService', 'ReserveStock')
    async grpcReserveStock(data: { productId: string; quantity: number }) {
        return this.productService.reserveStock(data.productId, data.quantity);
    }
}
