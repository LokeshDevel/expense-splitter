import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Expense } from './expenses/expense.entity';
import { ExpensesModule } from './expenses/expenses.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [Expense],
        synchronize: true,
      }),
    }),
    ExpensesModule,
  ],
})
export class AppModule {}
