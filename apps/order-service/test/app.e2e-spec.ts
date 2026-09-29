import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { OrderServiceModule } from './../src/order-service.module.js';

describe('OrderServiceController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [OrderServiceModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/orders (GET)', () => {
    return request(app.getHttpServer())
      .get('/orders')
      .expect(200);
  });

  afterEach(async () => {
    await app.close();
  });
});
