import { IsNotEmpty, IsNumber, IsPositive, IsString, IsArray, ArrayMinSize } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  payerName: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @ArrayMinSize(1)
  participants: string[];
}
