import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  storage,
  tablesDB,
} from "../lib/appwrite";

export type ItemPhoto = {
  id: string;
  fileId: string;
  sortOrder: number;
  isPrimary: boolean;
};

type PhotoToLink = {
  fileId: string;
  uri?: string;
};

type ItemPhotoRow = {
  $id: string;
  ownerId: string;
  itemId: string;
  fileId: string;
  sortOrder?: number | null;
  isPrimary?: boolean | null;
};

function photoFileIds(photos: ItemPhoto[]): string[] {
  return [...new Set(photos.map((photo) => photo.fileId.trim()).filter(Boolean))];
}

function ownerPermissions(userId: string) {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
}

function mapPhoto(row: ItemPhotoRow): ItemPhoto {
  return {
    id: row.$id,
    fileId: row.fileId,
    sortOrder: Number(row.sortOrder || 0),
    isPrimary: Boolean(row.isPrimary),
  };
}

export async function getItemPhotos({
  itemId,
  ownerId,
}: {
  itemId: string;
  ownerId: string;
}): Promise<ItemPhoto[]> {
  const response = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemPhotosTableId,
    queries: [
      Query.equal("ownerId", [ownerId]),
      Query.equal("itemId", [itemId]),
      Query.orderAsc("sortOrder"),
      // Keep the item-level array complete even when an item has more than
      // the listing composer limit of ten photos.
      Query.limit(100),
    ],
  });

  return (response.rows as unknown as ItemPhotoRow[])
    .map(mapPhoto)
    .filter((photo) => Boolean(photo.fileId));
}

async function writePhotoSummary({
  itemId,
  coverFileId,
  photos,
}: {
  itemId: string;
  coverFileId: string | null;
  photos: ItemPhoto[];
}) {
  const itemPhotos = photoFileIds(photos);
  const normalizedCoverFileId = coverFileId?.trim() || null;

  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: itemId,
    data: {
      coverPhotoId: normalizedCoverFileId,
      photoCount: itemPhotos.length,
      itemPhotos,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function setItemCoverPhoto({
  itemId,
  ownerId,
  fileId,
}: {
  itemId: string;
  ownerId: string;
  fileId: string;
}) {
  const photos = await getItemPhotos({ itemId, ownerId });

  if (!photos.some((photo) => photo.fileId === fileId)) {
    throw new Error("That photo is no longer attached to this item.");
  }

  await Promise.all(
    photos.map((photo) =>
      tablesDB.updateRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.itemPhotosTableId,
        rowId: photo.id,
        data: {
          isPrimary: photo.fileId === fileId,
        },
      })
    )
  );

  await writePhotoSummary({
    itemId,
    coverFileId: fileId,
    photos,
  });
}

export async function appendPhotoToItem({
  itemId,
  ownerId,
  fileId,
}: {
  itemId: string;
  ownerId: string;
  fileId: string;
}) {
  const photos = await getItemPhotos({ itemId, ownerId });
  const cleanFileId = fileId.trim();
  if (!cleanFileId) {
    throw new Error("The uploaded item photo is missing its file ID.");
  }

  const now = new Date().toISOString();
  const isFirstPhoto = photos.length === 0;
  const itemPhotoId = ID.unique();
  const appendedPhoto: ItemPhoto = {
    id: itemPhotoId,
    fileId: cleanFileId,
    sortOrder: photos.length,
    isPrimary: isFirstPhoto,
  };

  await tablesDB.createRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemPhotosTableId,
    rowId: itemPhotoId,
    data: {
      ownerId,
      itemId,
      fileId: cleanFileId,
      sortOrder: appendedPhoto.sortOrder,
      isPrimary: isFirstPhoto,
      createdAt: now,
    },
    permissions: ownerPermissions(ownerId),
  });

  await writePhotoSummary({
    itemId,
    coverFileId: isFirstPhoto
      ? cleanFileId
      : photos.find((photo) => photo.isPrimary)?.fileId ||
        photos[0]?.fileId ||
        cleanFileId,
    photos: [...photos, appendedPhoto],
  });
}

export async function removeItemPhoto({
  itemId,
  ownerId,
  photo,
}: {
  itemId: string;
  ownerId: string;
  photo: ItemPhoto;
}) {
  const photos = await getItemPhotos({ itemId, ownerId });
  const remaining = photos.filter((current) => current.id !== photo.id);

  await tablesDB.deleteRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemPhotosTableId,
    rowId: photo.id,
  });

  try {
    await storage.deleteFile({
      bucketId: APPWRITE.itemImagesBucketId,
      fileId: photo.fileId,
    });
  } catch (error) {
    // Removing the row still leaves the item usable if an old file is already missing.
    console.warn("KeepFlip could not remove an item image:", error);
  }

  const nextCover =
    remaining.find((current) => current.isPrimary)?.fileId ||
    remaining[0]?.fileId ||
    null;

  if (nextCover) {
    await Promise.all(
      remaining.map((current) =>
        tablesDB.updateRow({
          databaseId: APPWRITE.databaseId,
          tableId: APPWRITE.itemPhotosTableId,
          rowId: current.id,
          data: {
            isPrimary: current.fileId === nextCover,
          },
        })
      )
    );
  }

  await writePhotoSummary({
    itemId,
    coverFileId: nextCover,
    photos: remaining,
  });
}

export async function linkPhotosToItem({
  itemId,
  ownerId,
  photos,
  coverFileId,
}: {
  itemId: string;
  ownerId: string;
  photos: PhotoToLink[];
  coverFileId?: string | null;
}) {
  if (!photos.length) {
    return null;
  }

  const selectedCoverFileId =
    coverFileId && photos.some((photo) => photo.fileId === coverFileId)
      ? coverFileId
      : photos[0].fileId;

  const now = new Date().toISOString();
  const linkedPhotos: ItemPhoto[] = photos.map((photo, index) => ({
    id: 'linked-' + index,
    fileId: photo.fileId.trim(),
    sortOrder: index,
    isPrimary: photo.fileId === selectedCoverFileId,
  }));

  await Promise.all(
    linkedPhotos.map((photo) =>
      tablesDB.createRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.itemPhotosTableId,
        rowId: ID.unique(),
        data: {
          ownerId,
          itemId,
          fileId: photo.fileId,
          sortOrder: photo.sortOrder,
          isPrimary: photo.isPrimary,
          createdAt: now,
        },
        permissions: ownerPermissions(ownerId),
      })
    )
  );

  await writePhotoSummary({
    itemId,
    coverFileId: selectedCoverFileId,
    photos: linkedPhotos,
  });

  return selectedCoverFileId;
}

export async function getItemPhotoFileIds({
  itemId,
  ownerId,
}: {
  itemId: string;
  ownerId: string;
}): Promise<string[]> {
  const photos = await getItemPhotos({ itemId, ownerId });
  return [...photos]
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }

      return left.sortOrder - right.sortOrder;
    })
    .map((photo) => photo.fileId);
}
