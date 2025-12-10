// src/main.ts
import dns from 'dns';

// Prefer IPv4 over IPv6 when resolving hostnames. This helps avoid
// ENETUNREACH errors in hosting environments that don't route IPv6.
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
    // eslint-disable-next-line no-console
    console.log('DNS preference set to ipv4first');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Could not set DNS result order:', err);
  }
}

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port}`);
}
bootstrap();
