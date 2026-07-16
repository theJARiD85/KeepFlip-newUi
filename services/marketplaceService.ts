import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  tablesDB,
} from "../lib/appwrite";

export type MarketplaceListingStatus =
  | "draft"
  | "active"
  | "reserved"
  | "sold"
  | "removed";

export type MarketplaceListing = {
  id: string;
  sellerId: string;
  sellerName: string;
  sourceItemId: string;

  title: string;
  description: string;
  condition: string;
  category: string;
  photoFileIds?: string[];
  priceCents: number;
  priceNegotiable: boolean;
  fulfillmentMode: string;
  city: string;

  /*
    Approximate seller location used only for marketplace distance filtering.
    Do not show these values to buyers.
  */
  latitude: number | null;
  longitude: number | null;

  coverPhotoId?: string | null;
  photoCount: number;

  status: MarketplaceListingStatus;
  isPromoted: boolean;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type MarketplaceListingRow = {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;
  photoFileIds?: string[] | null;
  sellerId: string;
  sellerName: string;
  sourceItemId: string;

  title: string;
  description: string;
  condition: string;
  category: string;

  priceCents: number;
  priceNegotiable?: boolean | null;
  fulfillmentMode: string;
  city: string;

  latitude?: number | null;
  longitude?: number | null;

  coverPhotoId?: string | null;
  photoCount?: number | null;

  status: MarketplaceListingStatus;
  isPromoted?: boolean | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type PublishMarketplaceListingInput = {
  sellerId: string;
  sellerName: string;
  sourceItemId: string;

  title: string;
  description: string;
  condition: string;
  category: string;
  photoFileIds?: string[];
  priceCents: number;
  priceNegotiable: boolean;
  fulfillmentMode: string;

  /*
    ListingStudio currently uses ZIP, but city is also supported.
  */
  city?: string;
  zip?: string;

  latitude: number;
  longitude: number;

  coverPhotoId?: string | null;
  photoCount: number;
};

const visibleStatuses: MarketplaceListingStatus[] = [
  "active",
  "reserved",
  "sold",
];

function listingPermissions(sellerId: string) {
  return [
    Permission.read(Role.users()),
    Permission.update(Role.user(sellerId)),
    Permission.delete(Role.user(sellerId)),
  ];
}

function toFiniteCoordinate(value: unknown): number | null {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePhotoFileIds(
  value: unknown,
  coverPhotoId?: string | null
): string[] {
  const rawIds = Array.isArray(value) ? value : [];

  const ids = rawIds
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  if (coverPhotoId?.trim()) {
    ids.unshift(coverPhotoId.trim());
  }

  return [...new Set(ids)];
}

function rowToListing(
  row: MarketplaceListingRow
): MarketplaceListing {
  const coverPhotoId = row.coverPhotoId || null;
  const photoFileIds = normalizePhotoFileIds(
  row.photoFileIds,
  coverPhotoId
);
  return {
    id: row.$id,
    sellerId: row.sellerId,
    sellerName: row.sellerName || "KeepFlip seller",
    sourceItemId: row.sourceItemId,
    title: row.title,
    description: row.description,
    condition: row.condition,
    category: row.category,

    priceCents: Number(row.priceCents || 0),
    priceNegotiable: Boolean(row.priceNegotiable),
    fulfillmentMode: row.fulfillmentMode,
    city: row.city || "",

    latitude: toFiniteCoordinate(row.latitude),
    longitude: toFiniteCoordinate(row.longitude),

    coverPhotoId,
    photoFileIds,
    photoCount: Number(row.photoCount || photoFileIds.length),

    status: row.status,
    isPromoted: Boolean(row.isPromoted),
    publishedAt: row.publishedAt || null,
    createdAt:
      row.createdAt ||
      row.$createdAt ||
      new Date().toISOString(),
    updatedAt:
      row.updatedAt ||
      row.$updatedAt ||
      new Date().toISOString(),
  };
}

/*
  Fetch statuses separately so this remains compatible with the existing
  Appwrite status index and does not depend on multi-value status queries.
*/
export async function getMarketplaceListings(): Promise<
  MarketplaceListing[]
> {
  const responses = await Promise.all(
    visibleStatuses.map((status) =>
      tablesDB.listRows({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.marketplaceListingsTableId,
        queries: [
          Query.equal("status", [status]),
          Query.limit(100),
        ],
      })
    )
  );

  const byId = new Map<string, MarketplaceListingRow>();

  for (const response of responses) {
    const rows =
      response.rows as unknown as MarketplaceListingRow[];

    for (const row of rows) {
      byId.set(row.$id, row);
    }
  }

  return Array.from(byId.values())
    .map(rowToListing)
    .sort((left, right) => {
      const leftTime = new Date(
        left.publishedAt || left.createdAt
      ).getTime();

      const rightTime = new Date(
        right.publishedAt || right.createdAt
      ).getTime();

      return rightTime - leftTime;
    });
}

export async function getActiveMarketplaceListings(): Promise<
  MarketplaceListing[]
> {
  const listings = await getMarketplaceListings();

  return listings.filter(
    (listing) => listing.status === "active"
  );
}

export async function publishMarketplaceListing(
  input: PublishMarketplaceListingInput
): Promise<MarketplaceListing> {
  const title = input.title.trim();
  const description = input.description.trim();
  const city = (input.city || input.zip || "").trim();

  const sellerName =
    input.sellerName.trim() || "KeepFlip seller";

  if (!title) {
    throw new Error("Your listing needs a title.");
  }

  if (!description) {
    throw new Error("Your listing needs a description.");
  }

  if (!city) {
    throw new Error(
      "Add a city or ZIP code where this item is available."
    );
  }

  if (
    !Number.isFinite(input.priceCents) ||
    input.priceCents <= 0
  ) {
    throw new Error("Enter a valid asking price.");
  }

  if (
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude)
  ) {
    throw new Error(
      "KeepFlip needs approximate location access to publish a local marketplace listing."
    );
  }

  const existing = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.marketplaceListingsTableId,
    queries: [
      Query.equal("sourceItemId", [input.sourceItemId]),
      Query.equal("status", ["active"]),
      Query.limit(1),
    ],
  });

  if (existing.rows.length) {
    throw new Error(
      "This item already has an active marketplace listing."
    );
  }

  const now = new Date().toISOString();

  const photoFileIds = normalizePhotoFileIds(
    input.photoFileIds,
    input.coverPhotoId
  );
  
  if (!photoFileIds.length) {
    throw new Error(
      "Add at least one photo before publishing this marketplace listing."
    );
  }

  const response = await tablesDB.createRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.marketplaceListingsTableId,
    rowId: ID.unique(),
    data: {
      sellerId: input.sellerId,
      sellerName,
      sourceItemId: input.sourceItemId,

      title,
      description,
      condition: input.condition,
      category: input.category,

      priceCents: Math.round(input.priceCents),
      priceNegotiable: input.priceNegotiable,
      fulfillmentMode: input.fulfillmentMode,
      city,

      latitude: input.latitude,
      longitude: input.longitude,

      coverPhotoId: input.coverPhotoId || photoFileIds[0],
      photoCount: Math.max(input.photoCount, photoFileIds.length),
      photoFileIds,
      status: "active",
      isPromoted: false,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    permissions: listingPermissions(input.sellerId),
  });

  return rowToListing(
    response as unknown as MarketplaceListingRow
  );
}

export async function deleteMarketplaceListingsForSourceItem({
  sourceItemId,
  sellerId,
}: {
  sourceItemId: string;
  sellerId: string;
}): Promise<void> {
  const response = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.marketplaceListingsTableId,
    queries: [
      Query.equal("sourceItemId", [sourceItemId]),
      Query.limit(100),
    ],
  });

  const listings = response.rows as unknown as MarketplaceListingRow[];

  const ownedListings = listings.filter(
    (listing) => listing.sellerId === sellerId
  );

  await Promise.all(
    ownedListings.map((listing) =>
      tablesDB.deleteRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.marketplaceListingsTableId,
        rowId: listing.$id,
      })
    )
  );
}
