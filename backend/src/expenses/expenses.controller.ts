import { Body, Controller, Get, Post } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { Delete, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  create(@Body() dto: CreateExpenseDto) {
    return this.expensesService.create(dto);
  }

  @Get()
  findAll() {
    return this.expensesService.findAll();
  }

  @Get('settlements')
  getSettlements() {
    return this.expensesService.calculateSettlements();
  }

    @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearAll() {
    await this.expensesService.clearAll();
    return; // 204 No Content
  }
}
