import {
    BadGatewayException,
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
    OnModuleInit,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { status } from '@grpc/grpc-js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

export interface ProductGrpc {
    id: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ProductsResponse {
    products: ProductGrpc[];
}

export interface ProductGrpcService {
    findAll(data: Record<string, never>): Observable<ProductsResponse>;
    findOne(data: { id: string }): Observable<ProductGrpc>;
    create(data: CreateProductDto): Observable<ProductGrpc>;
    update(data: UpdateProductDto & { id: string }): Observable<ProductGrpc>;
    remove(data: { id: string }): Observable<ProductGrpc>;
}

@Injectable()
export class ProductsService implements OnModuleInit {
    private productService!: ProductGrpcService;

    constructor(
        @Inject('PRODUCT_PACKAGE') private readonly client: ClientGrpc,
    ) { }

    onModuleInit() {
        this.productService = this.client.getService<ProductGrpcService>('ProductService');
    }

    private handleGrpcError(error: any, defaultMessage: string): never {
        const code = error?.code;
        const message = error?.details || defaultMessage;

        if (code === status.NOT_FOUND) {
            throw new NotFoundException(message);
        }
        if (code === status.INVALID_ARGUMENT) {
            throw new BadRequestException(message);
        }
        if (code === status.UNAVAILABLE) {
            throw new BadGatewayException('Product service is unavailable');
        }
        throw new BadGatewayException(message || 'Product service error');
    }

    async findAll() {
        try {
            const response = await firstValueFrom(
                this.productService.findAll({}),
            );
            return response.products;
        } catch (error) {
            this.handleGrpcError(error, 'Failed to fetch products');
        }
    }

    async findOne(id: string) {
        try {
            return await firstValueFrom(
                this.productService.findOne({ id }),
            );
        } catch (error) {
            this.handleGrpcError(error, `Product with ID ${id} not found`);
        }
    }

    async create(dto: CreateProductDto) {
        try {
            return await firstValueFrom(
                this.productService.create(dto),
            );
        } catch (error) {
            this.handleGrpcError(error, 'Failed to create product');
        }
    }

    async update(id: string, dto: UpdateProductDto) {
        try {
            return await firstValueFrom(
                this.productService.update({ id, ...dto }),
            );
        } catch (error) {
            this.handleGrpcError(error, `Failed to update product ${id}`);
        }
    }

    async remove(id: string) {
        try {
            return await firstValueFrom(
                this.productService.remove({ id }),
            );
        } catch (error) {
            this.handleGrpcError(error, `Failed to delete product ${id}`);
        }
    }
}
