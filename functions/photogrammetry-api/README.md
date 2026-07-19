# KeepFlip Photogrammetry API

This Appwrite Function is the authenticated orchestration layer for KeepFlip's cross-platform 3D object scan pipeline. It does **not** run COLMAP, OpenMVS, Meshroom, or another reconstruction engine inside Appwrite. It validates the signed-in user's uploaded scan photos, persists a durable job row, dispatches a separate reconstruction worker, and exposes job status to the mobile app.

## Appwrite Function settings

- Function ID: `photogrammetry-api` (or set the actual ID in the Expo environment)
- Runtime: Node.js 22
- Entrypoint: `src/main.js`
- Build command: `npm install`
- Execute access: signed-in users
- Generated/custom domain: required for worker callbacks
- Recommended timeout: 15 seconds; the worker endpoint must acknowledge and queue the job quickly

## Required function variables

| Variable | Purpose |
| --- | --- |
| `PHOTOGRAMMETRY_DATABASE_ID` | Database containing the jobs table |
| `PHOTOGRAMMETRY_JOBS_TABLE_ID` | Durable job-status table |
| `PHOTOGRAMMETRY_INPUT_BUCKET_ID` | Private uploaded scan photos |
| `PHOTOGRAMMETRY_WORKER_URL` | Worker endpoint that queues reconstruction jobs |
| `PHOTOGRAMMETRY_WORKER_TOKEN` | Shared bearer token used in both directions |
| `PHOTOGRAMMETRY_CALLBACK_URL` | Public Function domain used by the worker for `worker_update` |

Optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PHOTOGRAMMETRY_OUTPUT_BUCKET_ID` | empty | Output bucket ID supplied to a worker that writes models to Appwrite |
| `PHOTOGRAMMETRY_DELETE_INPUTS_ON_TERMINAL` | `true` | Delete input photos after completed, failed, or canceled jobs |

Do not create variables with the `APPWRITE_` prefix. Appwrite injects the Function endpoint, project ID, and dynamic API key.

## Jobs table

Create a table with row security enabled and these columns:

| Key | Type | Required | Size/default |
| --- | --- | --- | --- |
| `ownerId` | string | yes | 36 |
| `status` | string | yes | 24 |
| `progress` | integer | yes | 0 |
| `photoCount` | integer | yes | 0 |
| `inputFileIds` | string array | yes | each 36, max 96 |
| `workerJobId` | string | no | 128 |
| `modelUrl` | string | no | 2048 |
| `modelFileId` | string | no | 36 |
| `error` | string | no | 1000 |
| `createdAt` | datetime | yes | none |
| `updatedAt` | datetime | yes | none |
| `startedAt` | datetime | no | none |
| `completedAt` | datetime | no | none |

Suggested indexes:

- key index: `ownerId`
- key index: `status`
- key index: `createdAt` descending
- compound key index: `ownerId`, `createdAt`

The Function grants the owner read and delete permission on each job. Only the Function/worker updates status.

## Input bucket

Create a private image bucket with:

- file security enabled
- authenticated users allowed to create files
- JPEG, PNG, and WebP MIME types
- a per-file size limit appropriate for full-resolution camera images
- no public read access

The mobile client assigns each input file read/delete permission only to the signed-in owner. The Function verifies every file through the invoking user's JWT before dispatching a job.

## Expo environment

Add these public resource IDs to the Expo build environment:

```env
EXPO_PUBLIC_APPWRITE_PHOTOGRAMMETRY_FUNCTION_ID=photogrammetry-api
EXPO_PUBLIC_APPWRITE_PHOTOGRAMMETRY_INPUT_BUCKET_ID=<INPUT_BUCKET_ID>
```

They are Appwrite resource IDs, not secrets.

## Worker request

The Function sends a `POST` request to `PHOTOGRAMMETRY_WORKER_URL`:

```json
{
  "contractVersion": 1,
  "action": "reconstruct",
  "jobId": "...",
  "ownerId": "...",
  "fileIds": ["..."],
  "photoCount": 36,
  "appwrite": {
    "endpoint": "https://<region>.cloud.appwrite.io/v1",
    "projectId": "...",
    "inputBucketId": "...",
    "outputBucketId": "..."
  },
  "callbackUrl": "https://<function-domain>"
}
```

The worker must have its own server-side Appwrite API key. The Function never sends an API key to the worker.

The worker should return HTTP 2xx immediately after queuing:

```json
{
  "workerJobId": "queue-job-id"
}
```

## Worker progress callback

The worker calls `PHOTOGRAMMETRY_CALLBACK_URL` with the shared bearer token:

```http
Authorization: Bearer <PHOTOGRAMMETRY_WORKER_TOKEN>
Content-Type: application/json
```

Processing update:

```json
{
  "action": "worker_update",
  "jobId": "...",
  "status": "processing",
  "progress": 45
}
```

Completed update:

```json
{
  "action": "worker_update",
  "jobId": "...",
  "status": "completed",
  "progress": 100,
  "modelUrl": "https://signed-model-url/model.glb"
}
```

A completed update must include either `modelUrl` or `modelFileId`.

## Mobile request contract

The Expo client uses synchronous Function executions for the short API calls because Appwrite only returns Function response bodies to synchronous executions. Reconstruction itself remains asynchronous in the external worker.

Supported actions:

- `create_job`
- `check_status`
- `cancel_job`
- `worker_update` (worker token only)

The current contract requires 12 to 96 distinct photos. The scanner UI must collect the full sequence before calling `PhotogrammetryAPI.createJob(...)`; a one-photo call is intentionally rejected.
