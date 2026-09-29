import {
    BadGatewayException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { CreateOrderDto } from './dto/create-order.dto.js';

@Injectable()
export class OrdersService {
    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) { }

    private get baseUrl(): string {
        return this.config.get<string>(
            'ORDER_SERVICE_URL',
            'http://localhost:3002',
        );
    }

    private handleAxiosError(error: unknown, defaultMessage: string): never {
        if (error instanceof AxiosError && error.response) {
            const status = error.response.status;
            const message = error.response.data?.message ?? defaultMessage;

            if (status === 400) {
                throw new BadRequestException(message);
            }
            if (status === 404) {
                throw new NotFoundException(message);
            }
            if (status === 409) {
                throw new ConflictException(message);
            }
            if (status === 403) {
                throw new ForbiddenException(message);
            }
            if (status === 500) {
                throw new InternalServerErrorException(message);
            }
        }
        throw new BadGatewayException('Order service is unavailable');
    }

    async create(
        userId: string,
        dto: CreateOrderDto,
        headerIdempotencyKey?: string,
    ) {
        try {
            const idempotencyKey = headerIdempotencyKey || dto.idempotencyKey;
            const headers: Record<string, string> = {};
            if (idempotencyKey) {
                headers['idempotency-key'] = idempotencyKey;
            }

            // Bind authenticated userId into the order service payload
            const payload = {
                ...dto,
                userId,
                idempotencyKey,
            };

            const response = await firstValueFrom(
                this.http.post(`${this.baseUrl}/orders`, payload, {
                    headers,
                    timeout: 10000,
                }),
            );

            return response.data;
        } catch (error) {
            this.handleAxiosError(error, 'Failed to create order');
        }
    }

    async findAll(userId?: string) {
        try {
            const response = await firstValueFrom(
                this.http.get(`${this.baseUrl}/orders`, {
                    params: userId ? { userId } : undefined,
                    timeout: 5000,
                }),
            );
            return response.data;
        } catch (error) {
            this.handleAxiosError(error, 'Failed to fetch orders');
        }
    }

    async findOne(id: string) {
        try {
            const response = await firstValueFrom(
                this.http.get(`${this.baseUrl}/orders/${id}`, {
                    timeout: 5000,
                }),
            );
            return response.data;
        } catch (error) {
            this.handleAxiosError(error, `Order with ID "${id}" not found`);
        }
    }
}
