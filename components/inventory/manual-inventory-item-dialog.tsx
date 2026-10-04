import { useState } from 'react';
import { Alert } from 'react-native';

import {
  AddToInventoryForm,
  type AddToInventoryFormValues,
} from '@/components/scanner/add-to-inventory-form';
import { createManualInventoryItem, type InventoryItem } from '@/services/inventory-service';
import {
  checkKeepFlipCapabilitiesAccess,
} from '@/services/keepflip-subscription-service';
import {
  centsFromLedgerAmount,
  createManualLedgerEntry,
  deleteLedgerReceipt,
  isResellerBooksConfigured,
  parseLedgerDate,
  uploadLedgerReceipt,
} from '@/services/reseller-ledger-service';
import {
  isResellerBookkeepingConfigured,
  recordBookkeepingEvent,
} from '@/services/reseller-bookkeeping-service';

type ManualInventoryItemDialogProps = {
  onCancel: () => void;
  onSaved: (item: InventoryItem) => void;
  ownerId: string;
  visible: boolean;
};

export function ManualInventoryItemDialog({
  onCancel,
  onSaved,
  ownerId,
  visible,
}: ManualInventoryItemDialogProps) {
  const [saving, setSaving] = useState(false);

  async function saveItem(values: AddToInventoryFormValues) {
    if (saving) return;

    const title = values.title.trim();
    if (!title) {
      Alert.alert('Item name required', 'Enter a name for this inventory item.');
      return;
    }

    const amountCents = centsFromLedgerAmount(values.acquisitionCost);
    if (!amountCents) {
      Alert.alert(
        'Actual cost required',
        'Enter what you actually paid, from $0.01 to $10,000,000.00.',
      );
      return;
    }

    const quantity = Number(values.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) {
      Alert.alert(
        'Check quantity',
        'Enter a whole number from 1 through 100,000.',
      );
      return;
    }

    const occurredAt = parseLedgerDate(values.acquiredAt);
    if (!occurredAt) {
      Alert.alert(
        'Check the date',
        'Use a real acquisition date in YYYY-MM-DD format.',
      );
      return;
    }

    if (!ownerId.trim()) {
      Alert.alert('Sign in required', 'Sign in before adding an inventory item.');
      return;
    }

    setSaving(true);
    let uploadedReceiptFileId: string | null = null;
    let item: InventoryItem | null = null;
    try {
      const access = await checkKeepFlipCapabilitiesAccess([
        'basic_books',
        'automated_books',
      ]);
      const advancedBooksAllowed = access.automated_books?.allowed === true;
      const basicBooksAllowed = access.basic_books?.allowed === true;
      const advancedBookkeepingConfigured =
        advancedBooksAllowed && isResellerBookkeepingConfigured();
      const legacyLedgerConfigured =
        basicBooksAllowed && isResellerBooksConfigured();

      if (!advancedBooksAllowed && !basicBooksAllowed) {
        throw new Error(
          'KeepFlip could not verify access to Books. Refresh and try again.',
        );
      }
      if (!advancedBookkeepingConfigured && !legacyLedgerConfigured) {
        throw new Error('Finish setting up Books before saving a purchase.');
      }

      let receiptFileId: string | null = null;
      if (values.receiptReference.trim()) {
        uploadedReceiptFileId = await uploadLedgerReceipt({
          imageUri: values.receiptReference,
          ownerId,
        });
        receiptFileId = uploadedReceiptFileId;
      }

      item = await createManualInventoryItem({
        acquiredAt: occurredAt,
        acquisitionCostCents: amountCents,
        itemSpecifics: values.itemSpecifics,
        ownerId,
        purchaseNotes: values.notes,
        purchaseSource: values.source,
        quantity,
        receiptFileId,
        sku: values.sku,
        storageLocation: values.location,
        title,
      });

      const purchaseDetails = [
        `Quantity: ${quantity}`,
        values.source.trim() ? `Purchase source: ${values.source.trim()}` : null,
        values.sku.trim() ? `SKU / tag: ${values.sku.trim()}` : null,
        values.location.trim() ? `Storage location: ${values.location.trim()}` : null,
        values.itemSpecifics.trim() ? 'Extra item details saved' : null,
        receiptFileId ? 'Receipt photo attached' : null,
        values.notes.trim() ? values.notes.trim() : null,
      ].filter((value): value is string => Boolean(value));

      try {
        if (advancedBookkeepingConfigured) {
          await recordBookkeepingEvent({
            amountCents,
            eventType: 'inventory_purchase',
            idempotencyKey: `inventory-purchase:${item.id}`,
            itemId: item.id,
            notes: purchaseDetails.length ? purchaseDetails.join(' | ') : null,
            occurredAt,
            summary: 'Inventory purchase',
          });
        } else {
          await createManualLedgerEntry({
            amountCents,
            channel: values.source.trim() || null,
            entryType: 'inventory_purchase',
            itemId: item.id,
            notes: purchaseDetails.length ? purchaseDetails.join(' | ') : null,
            occurredAt,
            ownerId,
            receiptFileId,
          });
        }
      } catch (bookkeepingError) {
        onSaved(item);
        onCancel();
        Alert.alert(
          'Item added; Books needs attention',
          'The item was saved to inventory, but its purchase entry could not be recorded. Open Books to add the actual purchase manually.' +
            (bookkeepingError instanceof Error
              ? ` ${bookkeepingError.message}`
              : ''),
        );
        return;
      }

      onSaved(item);
      onCancel();
      Alert.alert(
        'Item added',
        'The item and its purchase cost were saved. KeepFlip can use that cost when the item sells to calculate COGS.',
      );
    } catch (error) {
      if (uploadedReceiptFileId && !item) {
        await deleteLedgerReceipt(uploadedReceiptFileId).catch(() => undefined);
      }
      Alert.alert(
        'Could not add item',
        error instanceof Error
          ? error.message
          : 'KeepFlip could not save this inventory item.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AddToInventoryForm
      key={visible ? 'manual-add-open' : 'manual-add-closed'}
      itemTitle="item"
      manualEntry
      onCancel={onCancel}
      onSubmit={saveItem}
      submitting={saving}
      visible={visible}
    />
  );
}
