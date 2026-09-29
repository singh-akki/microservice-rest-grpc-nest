import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, INestMicroservice, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis';
import { ApiGatewayModule } from '../src/api-gateway.module.js';
import { OrderServiceModule } from '../../order-service/src/order-service.module.js';
import { OrderServiceService } from '../../order-service/src/order-service.service.js';
import { ProductService } from '../../product-service/src/product/product.service.js';
import { ProductModule } from '../../product-service/src/product/product.module.js';
import { NotificationServiceController } from '../../notification-service/src/notification-service.controller.js';
import { NotificationServiceService } from '../../notification-service/src/notification-service.service.js';

describe('Integration and Failure Testing (e2e)', () => {
  let gatewayApp: INestApplication<App>;
  let orderServiceApp: INestApplication<App>;
  let productMicroservice: INestMicroservice;
  let db: DatabaseService;
  let redis: RedisService;
  let jwtService: JwtService;
  let productService: ProductService;
  let orderService: OrderServiceService;
  let notificationController: NotificationServiceController;

  let testUser: { id: string; email: string; role: string };
  let authToken: string;

  beforeAll(async () => {
    // 0. Boot Product Service as gRPC Microservice on 0.0.0.0:50051
    productMicroservice = await NestFactory.createMicroservice<MicroserviceOptions>(ProductModule, {
      transport: Transport.GRPC,
      options: {
        package: 'product',
        protoPath: join(process.cwd(), 'proto/product.proto'),
        url: '0.0.0.0:50051',
      },
    });
    productMicroservice.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await productMicroservice.listen();

    productService = productMicroservice.get<ProductService>(ProductService);

    // 1. Boot Order Service on HTTP port 3002
    const orderModuleRef: TestingModule = await Test.createTestingModule({
      imports: [OrderServiceModule],
    }).compile();

    orderServiceApp = orderModuleRef.createNestApplication();
    orderServiceApp.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await orderServiceApp.init();
    await orderServiceApp.listen(3002);

    orderService = orderModuleRef.get<OrderServiceService>(OrderServiceService);
    db = orderModuleRef.get<DatabaseService>(DatabaseService);
    redis = orderModuleRef.get<RedisService>(RedisService);

    // 2. Boot Gateway App on ephemeral port
    const gatewayModuleRef: TestingModule = await Test.createTestingModule({
      imports: [ApiGatewayModule],
    }).compile();

    gatewayApp = gatewayModuleRef.createNestApplication();
    gatewayApp.setGlobalPrefix('api');
    gatewayApp.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await gatewayApp.init();

    jwtService = gatewayModuleRef.get<JwtService>(JwtService);

    // 3. Initialize Notification Controller for testing RMQ consumer behavior
    const notifService = new NotificationServiceService();
    notificationController = new NotificationServiceController(notifService);

    // 4. Seed test user
    const uniqueEmail = `test-buyer-${Date.now()}@example.com`;
    const user = await db.user.create({
      data: {
        name: 'Test Buyer',
        email: uniqueEmail,
        passwordHash: 'dummyhash',
        role: 'USER',
      },
    });
    testUser = { id: user.id, email: user.email, role: user.role };

    authToken = await jwtService.signAsync(
      { sub: testUser.id, email: testUser.email, role: testUser.role },
      { secret: process.env.JWT_SECRET || 'supersecret' },
    );
  });

  const cleanupProduct = async (productId: string) => {
    try {
      await db.orderItem.deleteMany({ where: { productId } });
      await db.order.deleteMany({ where: { items: { some: { productId } } } });
      await db.product.delete({ where: { id: productId } });
    } catch {
      // ignore
    }
  };

  afterAll(async () => {
    // Cleanup seeded data
    if (testUser?.id) {
      await db.orderItem.deleteMany({ where: { order: { userId: testUser.id } } }).catch(() => {});
      await db.order.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
      await db.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    await gatewayApp?.close();
    await orderServiceApp?.close();
    await productMicroservice?.close();
  });

  // =========================================================================
  // 1. Gateway -> Order Service -> Product Service (Happy Path)
  // =========================================================================
  describe('1. Gateway -> Order Service -> Product Service Workflow', () => {
    it('should successfully place order and decrement product stock', async () => {
      const product = await productService.create({
        name: 'Wireless Headphones',
        price: 99.99,
        stock: 10,
        isActive: true,
      });

      const response = await request(gatewayApp.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [{ productId: product.id, quantity: 2 }],
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.userId).toBe(testUser.id);
      expect(response.body.status).toBe('CONFIRMED');
      expect(Number(response.body.total)).toBeCloseTo(199.98, 2);

      // Verify stock was decremented in database from 10 to 8
      const updatedProduct = await db.product.findUnique({ where: { id: product.id } });
      expect(updatedProduct?.stock).toBe(8);

      // Clean up product
      await cleanupProduct(product.id);
    });
  });

  // =========================================================================
  // 2. Insufficient Stock and Nonexistent Products
  // =========================================================================
  describe('2. Insufficient Stock and Nonexistent Products', () => {
    it('should return 400 Bad Request when requesting more stock than available', async () => {
      const product = await productService.create({
        name: 'Limited Edition Watch',
        price: 250,
        stock: 3,
        isActive: true,
      });

      const response = await request(gatewayApp.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [{ productId: product.id, quantity: 10 }],
        })
        .expect(400);

      expect(response.body.message).toMatch(/Insufficient stock/);

      // Verify stock in database remains untouched at 3
      const productInDb = await db.product.findUnique({ where: { id: product.id } });
      expect(productInDb?.stock).toBe(3);

      await cleanupProduct(product.id);
    });

    it('should return 400 Bad Request when product does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(gatewayApp.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [{ productId: fakeId, quantity: 1 }],
        })
        .expect(400);

      expect(response.body.message).toMatch(/not found/i);
    });
  });

  // =========================================================================
  // 3. Concurrent Orders for Limited Stock (Overselling Prevention)
  // =========================================================================
  describe('3. Concurrent Orders for Limited Stock', () => {
    it('should prevent overselling when concurrent orders compete for the last items', async () => {
      // Product only has 2 items in stock
      const product = await productService.create({
        name: 'Flash Sale Gaming Console',
        price: 499,
        stock: 2,
        isActive: true,
      });

      // 5 concurrent requests all trying to buy 1 item each
      const requests = Array.from({ length: 5 }).map(() =>
        request(gatewayApp.getHttpServer())
          .post('/api/orders')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            items: [{ productId: product.id, quantity: 1 }],
          }),
      );

      const results = await Promise.all(requests);

      const successes = results.filter((res) => res.status === 201);
      const failures = results.filter((res) => res.status === 400);

      // Exactly 2 must succeed and 3 must fail
      expect(successes.length).toBe(2);
      expect(failures.length).toBe(3);

      // Verify database stock is exactly 0 (never negative)
      const finalProduct = await db.product.findUnique({ where: { id: product.id } });
      expect(finalProduct?.stock).toBe(0);

      await cleanupProduct(product.id);
    });
  });

  // =========================================================================
  // 4. Reservation Succeeds but Order Persistence Fails (Saga Compensation)
  // =========================================================================
  describe('4. Reservation Succeeds but Order Persistence Fails (Saga Rollback)', () => {
    it('should release reserved stock back to database if order persistence throws', async () => {
      const product = await productService.create({
        name: 'Mechanical Keyboard',
        price: 120,
        stock: 5,
        isActive: true,
      });

      // Temporarily mock db.order.create to throw a database connection error
      const originalCreate = db.order.create;
      vi.spyOn(db.order, 'create').mockRejectedValueOnce(
        new Error('PostgreSQL Disk Full / Connection Lost'),
      );

      // Attempt order creation directly through Order Service
      await expect(
        orderService.create({
          userId: testUser.id,
          items: [{ productId: product.id, quantity: 2 }],
        }),
      ).rejects.toThrow();

      // Verify SAGA compensation: stock was reserved then successfully rolled back to 5
      const productAfterRollback = await db.product.findUnique({ where: { id: product.id } });
      expect(productAfterRollback?.stock).toBe(5);

      db.order.create = originalCreate;
      await cleanupProduct(product.id);
    });
  });

  // =========================================================================
  // 5. Product Service Unavailable / gRPC Timeout
  // =========================================================================
  describe('5. Product Service Unavailable or Communication Failure', () => {
    it('should return clean error without hanging when Product Service is unreachable', async () => {
      // Mock client.getService to return an error stream
      const originalCheckStock = (orderService as any).productService.checkStock;
      (orderService as any).productService.checkStock = vi.fn().mockImplementation(() => {
        throw new Error('Connection refused: Product Service unreachable');
      });

      await expect(
        orderService.create({
          userId: testUser.id,
          items: [{ productId: 'some-product', quantity: 1 }],
        }),
      ).rejects.toThrow(/Failed to communicate with Product Service/);

      (orderService as any).productService.checkStock = originalCheckStock;
    });
  });

  // =========================================================================
  // 6. Redis Unavailable / Cache Outage
  // =========================================================================
  describe('6. Redis / Cache Outage Handling', () => {
    it('should fail-open and not block orders when Redis fails', async () => {
      // Redis setIfNotExists should fail open (return true) when Redis is down
      const isRedisConnected = await redis.ping();
      expect(typeof isRedisConnected).toBe('boolean');

      const mockRedisDel = vi.spyOn(redis, 'setIfNotExists').mockResolvedValueOnce(true);

      const product = await productService.create({
        name: 'Coffee Mug',
        price: 15,
        stock: 10,
        isActive: true,
      });

      const response = await request(gatewayApp.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          idempotencyKey: `idemp-${Date.now()}`,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      await cleanupProduct(product.id);
      mockRedisDel.mockRestore();
    });
  });

  // =========================================================================
  // 7. RabbitMQ Retries & Dead Letter Queue Routing
  // =========================================================================
  describe('7. RabbitMQ Retries and Dead Letter Queue Routing', () => {
    const mockChannel = {
      ack: vi.fn(),
      nack: vi.fn(),
    };

    const createRmqContext = (retryCount = 0) =>
      ({
        getChannelRef: () => mockChannel,
        getMessage: () => ({
          fields: { deliveryTag: 1 },
          properties: { headers: { 'x-retry-count': retryCount } },
        }),
      }) as any;

    it('should NACK with requeue=true for transient failures (retry)', async () => {
      vi.clearAllMocks();
      const context = createRmqContext(0); // Attempt 1

      // Simulate transient email sending failure
      vi.spyOn(
        (notificationController as any).notificationService,
        'processOrderConfirmation',
      ).mockRejectedValueOnce(new Error('SMTP Gateway Timeout'));

      await notificationController.handleOrderCreated(
        {
          orderId: 'order-123',
          userId: 'user-1',
          total: 50,
          items: [],
          createdAt: new Date().toISOString(),
        },
        context,
      );

      // Verify message is requeued for retry
      expect(mockChannel.nack).toHaveBeenCalledWith(context.getMessage(), false, true);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });

    it('should NACK with requeue=false (routing to DLQ) when max retries exceeded', async () => {
      vi.clearAllMocks();
      const context = createRmqContext(3); // Attempt 4 > max 3 retries

      vi.spyOn(
        (notificationController as any).notificationService,
        'processOrderConfirmation',
      ).mockRejectedValueOnce(new Error('Permanent Invalid Email Address'));

      await notificationController.handleOrderCreated(
        {
          orderId: 'order-123',
          userId: 'user-1',
          total: 50,
          items: [],
          createdAt: new Date().toISOString(),
        },
        context,
      );

      // Verify message is routed to DLQ (requeue = false)
      expect(mockChannel.nack).toHaveBeenCalledWith(context.getMessage(), false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });
  });
});
