import {
    BadGatewayException,
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { AxiosError } from 'axios';

@Injectable()
export class ProductsService {
    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) { }

    private get baseUrl(): string {
        return this.config.get<string>(
            'PRODUCT_SERVICE_URL',
            'http://localhost:3001',
        );
    }

    private handleAxiosError(error: unknown, defaultMessage: string): never {
        if (error instanceof AxiosError && error.response) {
            const status = error.response.status;
            const message = error.response.data?.message ?? defaultMessage;

            if (status === 404) {
                throw new NotFoundException(message);
            }
            if (status === 400) {
                throw new BadRequestException(message);
            }
        }
        throw new BadGatewayException('Product service is unavailable');
    }

    async findAll() {
        try {
            const response = await firstValueFrom(
                this.http.get(`${this.baseUrl}/products`, {
                    timeout: 5000,
                }),
            );
            return response.data;
        } catch (error) {
            this.handleAxiosError(error, 'Failed to fetch products');
        }
    }

    async findOne(id: string) {
        try {
            const response = await firstValueFrom(
                this.http.get(`${this.baseUrl}/products/${id}`, {
                    timeout: 5000,
                }),
            );
            return response.data;
        } catch (error) {
            this.handleAxiosError(error, `Product with ID ${id} not found`);
        }
    }

    async create(dto: CreateProductDto) {
        try {
            const response = await firstValueFrom(
                this.http.post(`${this.baseUrl}/products`, dto, {
                    timeout: 5000,
                }),
            );
            return response.data;
        } catch (error) {
            this.handleAxiosError(error, 'Failed to create product');
        }
    }

    async update(id: string, dto: UpdateProductDto) {
        try {
            const response = await firstValueFrom(
                this.http.patch(`${this.baseUrl}/products/${id}`, dto, {
                    timeout: 5000,
                }),
            );
            return response.data;
        } catch (error) {
            this.handleAxiosError(error, `Failed to update product ${id}`);
        }
    }

    async remove(id: string) {
        try {
            const response = await firstValueFrom(
                this.http.delete(`${this.baseUrl}/products/${id}`, {
                    timeout: 5000,
                }),
            );
            return response.data;
        } catch (error) {
            this.handleAxiosError(error, `Failed to delete product ${id}`);
        }
    }
}
