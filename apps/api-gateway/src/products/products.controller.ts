import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Controller('products')
@UseGuards(RateLimitGuard)
export class ProductsController {
    constructor(
        private readonly productsService: ProductsService,
    ) { }

    @RateLimit({
        limit: 100,
        windowSeconds: 60,
    })
    @Get()
    findAll() {
        return this.productsService.findAll();
    }

    @RateLimit({
        limit: 100,
        windowSeconds: 60,
    })
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.productsService.findOne(id);
    }

    @RateLimit({
        limit: 30,
        windowSeconds: 60,
    })
    @Post()
    create(@Body() dto: CreateProductDto) {
        return this.productsService.create(dto);
    }

    @RateLimit({
        limit: 30,
        windowSeconds: 60,
    })
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
        return this.productsService.update(id, dto);
    }

    @RateLimit({
        limit: 30,
        windowSeconds: 60,
    })
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.productsService.remove(id);
    }
}
