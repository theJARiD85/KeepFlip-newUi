import { APPWRITE, tablesDB } from '@/lib/appwrite';
import { calculateNetProceeds, type NetProceedsInput } from '@/lib/seller-net-proceeds';

export type SellerProceedsPlan = {
  version: 1;
  currency: string;
  input: NetProceedsInput;
  quickSaleCents: number | null;
  highAskCents: number | null;
};

async function ownedItem(ownerId: string, itemId: string) {
  if (!ownerId || !itemId) throw new Error('Sign in and choose an inventory item.');
  const row = await tablesDB.getRow({ databaseId: APPWRITE.databaseId, tableId: APPWRITE.itemsTableId, rowId: itemId });
  if (row.ownerId !== ownerId) throw new Error('This item does not belong to your account.');
  return row;
}

export async function loadSellerProceedsPlan(ownerId: string, itemId: string): Promise<SellerProceedsPlan | null> {
  const row = await ownedItem(ownerId, itemId);
  if (typeof row.sellerProceedsJson !== 'string' || !row.sellerProceedsJson) return null;
  const plan = JSON.parse(row.sellerProceedsJson) as SellerProceedsPlan;
  if (plan.version !== 1 || !/^[A-Z]{3}$/.test(plan.currency)) throw new Error('Saved proceeds plan needs review.');
  calculateNetProceeds(plan.input);
  return plan;
}

export async function saveSellerProceedsPlan(ownerId: string, itemId: string, plan: SellerProceedsPlan) {
  calculateNetProceeds(plan.input);
  if (!/^[A-Z]{3}$/.test(plan.currency)) throw new Error('Choose a valid currency.');
  for (const price of [plan.quickSaleCents, plan.highAskCents]) {
    if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000)) throw new Error('Enter a valid scenario price.');
  }
  await ownedItem(ownerId, itemId);
  try {
    await tablesDB.updateRow({ databaseId: APPWRITE.databaseId, tableId: APPWRITE.itemsTableId, rowId: itemId,
      data: { sellerProceedsJson: JSON.stringify(plan) } });
  } catch (error) {
    if (error instanceof Error && /sellerProceedsJson|unknown.*(column|attribute)/i.test(error.message)) {
      throw new Error('Saving proceeds needs the seller workflow database update. Your entered numbers are still on this screen.');
    }
    throw error;
  }
}
