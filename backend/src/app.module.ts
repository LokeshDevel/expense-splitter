// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ExpensesModule } from './expenses/expenses.module';
import { Expense } from './expenses/expense.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL, // full postgres://... URL from Supabase
        // important: tell the pg client to accept the Supabase certificate
        // in Render's environment. This avoids "self signed certificate" errors.
        extra: {
          ssl: {
            rejectUnauthorized: false,
          },
        },
        entities: [Expense],
        synchronize: true, // ok for small dev app
      }),
    }),
    ExpensesModule,
  ],
})
export class AppModule {}
