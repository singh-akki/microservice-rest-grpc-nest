import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
} from '@nestjs/common';
import { ProductService } from './product.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Controller('products')
export class ProductController {
    constructor(private readonly productService: ProductService) { }

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
}
