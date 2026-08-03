import {
  APPWRITE,
  ID,
  Query,
  realtime,
  tablesDB,
} from "../lib/appwrite";
import {
  Channel,
  Permission,
  Role,
  type RealtimeSubscription,
} from "react-native-appwrite";

export type MarketplaceInquiryKind = "message" | "offer";
export type MarketplaceInquiryStatus =
  | "sent"
  | "accepted"
  | "declined"
  | "withdrawn";

export type MarketplaceInquiry = {
  id: string;
  listingId: string;
  listingTitle: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  threadKey: string;
  kind: MarketplaceInquiryKind;
  body: string;
  offerCents: number;
  status: MarketplaceInquiryStatus;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceMailboxMode = "buying" | "selling";

export type MarketplaceMailboxThread = {
  threadKey: string;
  listingId: string;
  listingTitle: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  latest: MarketplaceInquiry;
  latestOffer: MarketplaceInquiry | null;
  messageCount: number;
};

type MarketplaceInquiryRow = {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;
  listingId: string;
  listingTitle?: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  buyerId?: string | null;
  buyerName?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  recipientId?: string | null;
  recipientName?: string | null;
  threadKey?: string | null;
  kind: MarketplaceInquiryKind;
  body?: string | null;
  offerCents?: number | null;
  status?: MarketplaceInquiryStatus | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CreateMarketplaceInquiryInput = {
  listingId: string;
  listingTitle: string;
  sellerId?: string;
  sellerName?: string;
  buyerId?: string;
  buyerName?: string;
  senderId?: string;
  senderName?: string;
  recipientId?: string;
  recipientName?: string;
  kind: MarketplaceInquiryKind;
  body: string;
  offerCents?: number;
};

function cleanUserId(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^user:/, "")
    .split("/")[0]
    .trim();
}

function threadKey(listingId: string, buyerId: string, sellerId: string) {
  return `${listingId}:${buyerId}:${sellerId}`;
}

function marketplaceInquiriesRowsChannel() {
  return Channel.tablesdb(APPWRITE.databaseId)
    .table(APPWRITE.marketplaceInquiriesTableId)
    .row();
}

function rowToInquiry(row: MarketplaceInquiryRow): MarketplaceInquiry {
  const buyerId = cleanUserId(row.buyerId);
  const sellerId = cleanUserId(row.sellerId || row.recipientId);

  return {
    id: row.$id,
    listingId: row.listingId,
    listingTitle: row.listingTitle || "Market listing",
    sellerId,
    sellerName: row.sellerName || row.recipientName || "KeepFlip seller",
    buyerId,
    buyerName: row.buyerName || row.senderName || "KeepFlip buyer",
    senderId: cleanUserId(row.senderId || row.buyerId || buyerId),
    senderName: row.senderName || row.buyerName || "KeepFlip member",
    recipientId: cleanUserId(row.recipientId || row.sellerId || sellerId),
    recipientName: row.recipientName || row.sellerName || "KeepFlip member",
    threadKey: row.threadKey || threadKey(row.listingId, buyerId, sellerId),
    kind: row.kind,
    body: row.body || "",
    offerCents: Number(row.offerCents || 0),
    status: row.status || "sent",
    createdAt: row.createdAt || row.$createdAt || new Date().toISOString(),
    updatedAt: row.updatedAt || row.$updatedAt || new Date().toISOString(),
  };
}

function newestFirst(left: MarketplaceInquiry, right: MarketplaceInquiry) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

export async function createMarketplaceInquiry(
  input: CreateMarketplaceInquiryInput
): Promise<MarketplaceInquiry> {
  const senderId = cleanUserId(input.senderId);
  const recipientId = cleanUserId(input.recipientId);
  const buyerId = cleanUserId(input.buyerId);
  const sellerId = cleanUserId(input.sellerId);
  const body = input.body.trim();
  const offerCents = Math.round(input.offerCents || 0);

  if (!input.listingId?.trim()) {
    throw new Error("This marketplace listing is unavailable.");
  }

  if (!senderId || !recipientId || !buyerId || !sellerId) {
    throw new Error("KeepFlip could not identify the buyer, seller, sender, or recipient.");
  }

  if (buyerId === sellerId || senderId === recipientId) {
    throw new Error("You cannot message your own listing.");
  }

  if (body.length < 2) {
    throw new Error("Write a short message before sending.");
  }

  if (input.kind === "offer" && (!Number.isFinite(offerCents) || offerCents <= 0)) {
    throw new Error("Enter a valid offer amount.");
  }

  const sellerName = input.sellerName?.trim() || input.recipientName?.trim() || "KeepFlip seller";
  const buyerName = input.buyerName?.trim() || input.senderName?.trim() || "KeepFlip buyer";
  const senderName = input.senderName?.trim() || (senderId === buyerId ? buyerName : sellerName);
  const recipientName = input.recipientName?.trim() || (recipientId === sellerId ? sellerName : buyerName);
  const now = new Date().toISOString();

  const response = await tablesDB.createRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.marketplaceInquiriesTableId,
    rowId: ID.unique(),
    data: {
      listingId: input.listingId.trim(),
      listingTitle: input.listingTitle.trim() || "Market listing",
      sellerId,
      sellerName,
      buyerId,
      buyerName,
      senderId,
      senderName,
      recipientId,
      recipientName,
      threadKey: threadKey(input.listingId.trim(), buyerId, sellerId),
      kind: input.kind,
      body,
      offerCents: input.kind === "offer" ? offerCents : 0,
      status: "sent",
      createdAt: now,
      updatedAt: now,
    },
    permissions: [
      Permission.read(Role.any()),
      Permission.update(Role.any()),
      Permission.delete(Role.any()),
    ],
  });

  return rowToInquiry(response as unknown as MarketplaceInquiryRow);
}

export async function subscribeToMarketplaceThread(
  threadKeyValue: string,
  onChange: () => void
): Promise<RealtimeSubscription> {
  const threadKey = threadKeyValue.trim();

  if (!threadKey) {
    throw new Error("A valid marketplace thread key is required.");
  }

  return realtime.subscribe<MarketplaceInquiryRow>(
    marketplaceInquiriesRowsChannel(),
    onChange,
    [Query.equal("threadKey", [threadKey])]
  );
}

export async function subscribeToMarketplaceMailboxThreads(
  userId: string,
  mode: MarketplaceMailboxMode,
  onChange: () => void
): Promise<RealtimeSubscription> {
  const cleanId = cleanUserId(userId);

  if (!cleanId) {
    throw new Error("A valid user ID is required for marketplace mailbox subscription.");
  }

  const field = mode === "selling" ? "sellerId" : "buyerId";

  return realtime.subscribe<MarketplaceInquiryRow>(
    marketplaceInquiriesRowsChannel(),
    onChange,
    [Query.equal(field, [cleanId])]
  );
}

export async function subscribeToMarketplaceListingInquiries(
  listingId: string,
  onChange: () => void
): Promise<RealtimeSubscription> {
  const cleanListingId = listingId.trim();

  if (!cleanListingId) {
    throw new Error("A valid listing ID is required.");
  }

  return realtime.subscribe<MarketplaceInquiryRow>(
    marketplaceInquiriesRowsChannel(),
    onChange,
    [Query.equal("listingId", [cleanListingId])]
  );
}

export async function getMarketplaceInquiriesForListing(listingId: string) {
  const response = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.marketplaceInquiriesTableId,
    queries: [Query.equal("listingId", [listingId]), Query.limit(100)],
  });
  return (response.rows as unknown as MarketplaceInquiryRow[])
    .map(rowToInquiry)
    .sort(newestFirst);
}

export async function getMarketplaceThread(threadKeyValue: string) {
  const response = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.marketplaceInquiriesTableId,
    queries: [Query.equal("threadKey", [threadKeyValue]), Query.limit(100)],
  });
  return (response.rows as unknown as MarketplaceInquiryRow[])
    .map(rowToInquiry)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export async function getMarketplaceMailboxThreads(
  userId: string,
  mode: MarketplaceMailboxMode
): Promise<MarketplaceMailboxThread[]> {
  const response = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.marketplaceInquiriesTableId,
    queries: [
      Query.equal(mode === "selling" ? "sellerId" : "buyerId", [cleanUserId(userId)]),
      Query.limit(100),
    ],
  });

  const grouped = new Map<string, MarketplaceInquiry[]>();
  for (const row of response.rows as unknown as MarketplaceInquiryRow[]) {
    const inquiry = rowToInquiry(row);
    const current = grouped.get(inquiry.threadKey) || [];
    current.push(inquiry);
    grouped.set(inquiry.threadKey, current);
  }

  return Array.from(grouped.entries())
    .map(([threadKeyValue, messages]) => {
      const ordered = [...messages].sort(newestFirst);
      const latest = ordered[0];
      return {
        threadKey: threadKeyValue,
        listingId: latest.listingId,
        listingTitle: latest.listingTitle,
        sellerId: latest.sellerId,
        sellerName: latest.sellerName,
        buyerId: latest.buyerId,
        buyerName: latest.buyerName,
        latest,
        latestOffer: ordered.find((message) => message.kind === "offer") || null,
        messageCount: messages.length,
      };
    })
    .sort((left, right) => new Date(right.latest.createdAt).getTime() - new Date(left.latest.createdAt).getTime());
}

export async function updateMarketplaceInquiryStatus(
  inquiryId: string,
  status: Exclude<MarketplaceInquiryStatus, "withdrawn">
) {
  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.marketplaceInquiriesTableId,
    rowId: inquiryId,
    data: { status, updatedAt: new Date().toISOString() },
  });
}
