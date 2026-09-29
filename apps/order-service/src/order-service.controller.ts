import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
} from '@nestjs/common';
import { OrderServiceService } from './order-service.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';

@Controller('orders')
export class OrderServiceController {
    constructor(private readonly orderService: OrderServiceService) { }

    @Post()
    create(
        @Body() dto: CreateOrderDto,
        @Headers('idempotency-key') headerIdempotencyKey?: string,
    ) {
        if (headerIdempotencyKey && !dto.idempotencyKey) {
            dto.idempotencyKey = headerIdempotencyKey;
        }
        return this.orderService.create(dto);
    }

    @Get()
    findAll() {
        return this.orderService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.orderService.findOne(id);
    }
}
