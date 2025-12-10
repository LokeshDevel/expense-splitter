import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './expense.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private expensesRepo: Repository<Expense>,
  ) {}

  async create(dto: CreateExpenseDto): Promise<Expense> {
    const expense = this.expensesRepo.create({
      payerName: dto.payerName,
      amount: dto.amount,
      description: dto.description,
      participants: dto.participants.join(','),
    });
    return this.expensesRepo.save(expense);
  }

  async findAll(): Promise<Expense[]> {
    return this.expensesRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Simple algorithm:
   * - For each expense:
   *   - Split amount evenly among participants.
   *   - Each participant owes "share".
   *   - Payer covers the whole amount.
   *   - Net balance[name]: + means they should receive money, - means they owe.
   */
  // inside ExpensesService
    async calculateSettlements() {
      const expenses = await this.findAll();

      const balances: Record<string, number> = {};

      const addBalance = (name: string, amount: number) => {
        if (!balances[name]) balances[name] = 0;
        balances[name] += amount;
      };

      for (const e of expenses) {
        const participants = e.participants
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        if (participants.length === 0) continue;

         const share = Number(e.amount) / participants.length;

        for (const p of participants) {
          addBalance(p, -share);
        }

        addBalance(e.payerName, Number(e.amount));
      }

      type Party = { name: string; amount: number };
      const creditors: Party[] = [];
      const debtors: Party[] = [];

      for (const [name, balance] of Object.entries(balances)) {
        const rounded = Math.round(balance * 100) / 100;
        if (rounded > 0) creditors.push({ name, amount: rounded });
        else if (rounded < 0) debtors.push({ name, amount: -rounded });
      }

      const settlements: { from: string; to: string; amount: number }[] = [];
      let i = 0;
      let j = 0;

      while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];
        const amount = Math.min(debtor.amount, creditor.amount);

        settlements.push({
          from: debtor.name,
          to: creditor.name,
          amount: Math.round(amount * 100) / 100,
        });

        debtor.amount -= amount;
        creditor.amount -= amount;

        if (debtor.amount === 0) i++;
        if (creditor.amount === 0) j++;
      }

      return {
        balances,
        settlements,
      };
    }
     /**
   * Remove all expense rows from the DB.
   * Uses repository.clear() to remove all entries (and reset primary keys depending on DB).
   */
  async clearAll(): Promise<void> {
    // You can choose this or use delete({}) — clear() is simpler to empty the table.
    await this.expensesRepo.clear();
  }

}
