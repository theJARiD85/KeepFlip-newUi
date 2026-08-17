# Deal Shelf Appwrite schema

`shelf` is a private decision queue, not a second inventory table. The complete
normalized `ItemAnalysisSuccess` result lives in `analysisSnapshotJson`; the
other columns are only the compact values needed to render, sort, expire, and
promote a shelf record.

## Setup

1. Create (or keep) the Appwrite table named `shelf`.
2. Sign in with the Appwrite CLI and run:

   ```powershell
   .\scripts\setup-appwrite-deal-shelf.ps1
   ```

   The script finds a table named `shelf` automatically. If the table has a
   custom ID, pass it explicitly with `-TableId`.
3. Add the returned table ID to `.env`:

   ```text
   EXPO_PUBLIC_APPWRITE_SHELF_TABLE_ID=<your-shelf-table-id>
   ```
4. Restart Expo after changing `.env`. Wait for every Appwrite column and index
   to report **Available** before using the Shelf.

The script enables row security, grants authenticated users table-level
create access, and the app assigns owner-only read/update/delete permissions
to every Shelf row.

## Columns

| Key | Appwrite type | Required | Why it exists |
| --- | --- | --- | --- |
| `ownerId` | varchar(36) | yes | Private-row owner and query scope |
| `shelfStatus` | enum | yes | `active`, `promoted`, `passed`, `expired`, or `archived` |
| `title` | varchar(180) | yes | Card title |
| `scanId` | varchar(36) | yes | Reuses saved scanner photos when promoted |
| `analysisSnapshotJson` | mediumtext | yes | Complete, normalized analysis envelope |
| `currency` | varchar(3) | yes | Value formatting |
| `decision` | enum | yes | Evidence-bound decision-card type |
| `expiresAt` | datetime | yes | 72-hour decision deadline |
| `createdAt` | datetime | yes | Queue ordering |
| `updatedAt` | datetime | yes | Lifecycle changes |
| `coverPhotoId` | varchar(36) | no | Durable primary scanner-photo pointer |
| `modelFile` | text | no | Existing 3D-model URL used when promoting to inventory |
| `photoCount` | integer 0–21 | no | Scan coverage signal |
| `quickSaleValueCents` | integer | no | Low resale estimate, in cents |
| `targetSaleValueCents` | integer | no | Mid resale estimate, in cents |
| `maxBuyPriceCents` | integer | no | User-entered buy threshold when that control is added |
| `askingPriceCents` | integer | no | User-entered seller ask when that control is added |
| `valuationLadderLevel` | varchar(16) | no | `Level 1` through `Level 5` |
| `valuationLadderConfidence` | integer 0–100 | no | Ladder confidence |
| `sourceType` | varchar(32) | no | Where the deal was found |
| `sourceName` | varchar(160) | no | Specific source or seller label |
| `sourceUrl` | url | no | Optional original listing URL |
| `notes` | text | no | User-authored deal notes |
| `promotedItemId` | varchar(36) | no | New inventory row after purchase |
| `promotedAt` | datetime | no | Promotion timestamp |

Do not add `photoUri` or `stateJson`: a device `file://` URI is not durable,
and the result state is recreated from `analysisSnapshotJson`.

## If Shelf started as a copy of Items

Shelf does not duplicate category, visible condition, or legacy flip fields as
compact columns. When the existing table has copied `category`, `condition`,
`flipDecision`, or `flipVerdict` fields marked required, the setup script makes
them optional with explicit absence defaults. The Shelf UI does not read or
display those legacy values; the normalized snapshot remains the source of
truth.

## Indexes

| Key | Type | Columns | Used by |
| --- | --- | --- | --- |
| `shelf_owner_status_created` | key | `ownerId`, `shelfStatus`, `createdAt` | Active shelf queue, newest first |
| `shelf_owner_created` | key | `ownerId`, `createdAt` | Safe list fallback while a new composite index is building |
| `shelf_owner_status_expires` | key | `ownerId`, `shelfStatus`, `expiresAt` | Expiry/decision-deadline work |
| `shelf_owner_scan` | unique | `ownerId`, `scanId` | Prevents duplicate saves of one scanner session |
