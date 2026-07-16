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
      Query.limit(10),
    ],
  });

  return (response.rows as unknown as ItemPhotoRow[])
    .map(mapPhoto)
    .filter((photo) => Boolean(photo.fileId));
}

async function writePhotoSummary({
  itemId,
  coverFileId,
  photoCount,
}: {
  itemId: string;
  coverFileId: string | null;
  photoCount: number;
}) {
  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: itemId,
    data: {
      coverPhotoId: coverFileId,
      photoCount,
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
    photoCount: photos.length,
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
  const now = new Date().toISOString();
  const isFirstPhoto = photos.length === 0;

  await tablesDB.createRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemPhotosTableId,
    rowId: ID.unique(),
    data: {
      ownerId,
      itemId,
      fileId,
      sortOrder: photos.length,
      isPrimary: isFirstPhoto,
      createdAt: now,
    },
    permissions: ownerPermissions(ownerId),
  });

  await writePhotoSummary({
    itemId,
    coverFileId: isFirstPhoto
      ? fileId
      : photos.find((photo) => photo.isPrimary)?.fileId ||
        photos[0]?.fileId ||
        fileId,
    photoCount: photos.length + 1,
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
    photoCount: remaining.length,
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

  await Promise.all(
    photos.map((photo, index) =>
      tablesDB.createRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.itemPhotosTableId,
        rowId: ID.unique(),
        data: {
          ownerId,
          itemId,
          fileId: photo.fileId,
          sortOrder: index,
          isPrimary: photo.fileId === selectedCoverFileId,
          createdAt: now,
        },
        permissions: ownerPermissions(ownerId),
      })
    )
  );

  await writePhotoSummary({
    itemId,
    coverFileId: selectedCoverFileId,
    photoCount: photos.length,
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
