export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  startBalance: number | null;
  endBalance: number | null;
  amount: number | null;
  type: string;
  category: string;
  subCategory: string;
  paidTo: string;
  comment: string;
  bankText: string;
  budgeted: string; // Yes | No | WO
}

export interface DropdownSettings {
  types: string[];
  categories: string[];
  subCategories: string[];
  budgetedOptions: string[];
}

export interface AppData {
  transactions: Transaction[];
  settings: DropdownSettings;
}

export const DEFAULT_SETTINGS: DropdownSettings = {
  types: ['One off', 'Reccuring', 'Reccuring Plus'],
  categories: [
    'Bank', 'Car Lease', 'Day care', 'Groceries', 'Healthcare', 'Hobbies',
    'Home', 'Insurance', 'Money In', 'One off plus', 'Other', 'Restaurants', 'Savings',
    'Shopping', 'Shopping - Chana', 'Shopping - Liam', 'Shopping - Umesha',
    'Subscriptions', 'Travel', 'Utilities', 'Vacation',
  ],
  subCategories: [
    'Apps', 'Bank Charges', 'Budget gap', 'Car', 'Car Charging', 'Clothes',
    'Consumables', 'Day Care', 'Dine In', 'Electricity', 'Flying', 'Health',
    'Heating', 'Internet', 'Investment', 'Life', 'Mobile', 'Mortgage', 'Other',
    'Parking', 'Pharmacy', 'Salary', 'Savings', 'Scooter', 'Streaming',
    'Super Market', 'Take out', 'Train', 'Umesha', 'VvE', 'Water',
  ],
  budgetedOptions: ['Yes', 'No', 'WO'],
};
