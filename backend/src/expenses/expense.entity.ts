import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Expense {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  payerName: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column()
  description: string;

  // store participants as a comma-separated string
  @Column()
  participants: string; // e.g. "Alice,Bob,Charlie"

  @CreateDateColumn()
  createdAt: Date;
}
