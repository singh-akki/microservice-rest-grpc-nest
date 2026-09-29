import {
    Body,
    Controller,
    Get,
    Param,
    Post,
} from '@nestjs/common';
import { OrderServiceService } from './order-service.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';

@Controller('orders')
export class OrderServiceController {
    constructor(private readonly orderService: OrderServiceService) { }

    @Post()
    create(@Body() dto: CreateOrderDto) {
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
