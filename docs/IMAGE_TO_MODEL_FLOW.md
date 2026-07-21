# KeepFlip scanner → Tripo3D flow

The scanner is the only part of the mobile app that saves captured source images. It uploads each source image to the permanent item-images bucket and creates the matching `item_photos` row. The `image-to-model` Appwrite Function is event-driven and does not accept manual execution from the app.

## Flow

1. `scanner-screen.native.tsx` captures or selects an image.
2. `saveScannerPhoto()` uploads the original image to the item-images bucket.
3. The app creates an `item_photos` row using the same ID as the Storage file.
4. The `item_photos` row-create event invokes `image-to-model`.
5. The Function ignores non-primary rows, creates a `model_files` row with `status=processing`, downloads the source image, and calls Tripo3D.
6. The Function saves the GLB in the model bucket using the item-photo row ID as the model file ID.
7. The Function updates `model_files` to `status=ready` or `status=failed`.
8. The scanner polls only the matching `model_files` row and displays the GLB when it becomes ready.
9. Saving the analyzed item links the existing `item_photos` and `model_files` rows to the new inventory `itemId`; it does not upload the source images again.

## App environment variables

```text
EXPO_PUBLIC_APPWRITE_DATABASE_ID
EXPO_PUBLIC_APPWRITE_ITEMS_COLLECTION_ID
EXPO_PUBLIC_APPWRITE_ITEM_PHOTOS_COLLECTION_ID
EXPO_PUBLIC_APPWRITE_ITEM_IMAGES_BUCKET_ID
EXPO_PUBLIC_APPWRITE_MODEL_FILES_COLLECTION_ID
EXPO_PUBLIC_APPWRITE_MODEL_BUCKET_ID
```

The existing temporary-analysis variables remain separate:

```text
EXPO_PUBLIC_APPWRITE_SCAN_BUCKET_ID
EXPO_PUBLIC_APPWRITE_ANALYZE_FUNCTION_ID
```

## `item_photos` table

| Column | Type | Required |
| --- | --- | --- |
| `ownerId` | string(36) | yes |
| `scanId` | string(36) | yes |
| `itemId` | string(36) | no |
| `fileId` | string(36) | yes |
| `sortOrder` | integer, 0–20 | yes |
| `isPrimary` | boolean | yes |
| `createdAt` | datetime | yes |

Create an index that supports filtering by `ownerId` and `scanId`, ordered by `sortOrder`.

The table must allow authenticated users to create rows. Enable row security so the per-row owner permissions assigned by the app are enforced.

## `model_files` table

| Column | Type | Required |
| --- | --- | --- |
| `ownerId` | string(36) | yes |
| `scanId` | string(36) | yes |
| `itemPhotoId` | string(36) | yes |
| `sourceFileId` | string(36) | yes |
| `itemId` | string(36) | no |
| `fileId` | string(36) | no |
| `status` | string(16) | yes |
| `providerTaskId` | string(255) | no |
| `errorMessage` | string(2000) | no |
| `createdAt` | datetime | yes |
| `updatedAt` | datetime | yes |

The Function uses `item_photos.$id` as both `model_files.$id` and the GLB Storage file ID.

## Storage

### Item-images bucket

- Permanent original scan images.
- Authenticated users need create permission.
- Enable file security so the owner permissions assigned by the app are enforced.

### Model bucket

- Permanent generated GLB files.
- The Function dynamic API key needs file read/write access.
- Enable file security; the Function assigns the source owner read/update/delete permissions to each GLB.

### Temporary scan bucket

- Used only by item analysis for compressed evidence.
- Temporary files continue to be removed by `item-analysis-service.ts`.

## Function configuration

Repository: `theJARiD85/image-to-model`

Trigger:

```text
tablesdb.<DATABASE_ID>.tables.<ITEM_PHOTOS_TABLE_ID>.rows.*.create
```

Remove the previous Storage file-create trigger.

Function variables:

```text
TRIPO_API_KEY
TRIPO_API_BASE_URL                  optional
KEEPFLIP_DATABASE_ID
KEEPFLIP_ITEM_PHOTOS_TABLE_ID
KEEPFLIP_MODEL_FILES_TABLE_ID
KEEPFLIP_IMAGE_BUCKET_ID
KEEPFLIP_MODEL_BUCKET_ID
```

Configuration:

```text
Runtime: Node.js 22
Entrypoint: src/main.js
Build command: npm install
Timeout: 900 seconds
```

Grant the Function dynamic API key the minimum TablesDB row read/write and Storage file read/write scopes needed by the Function.

Redeploy after changing variables, scopes, events, or repository code.
