import {
  Client,
  ID,
  Permission,
  Role,
  Storage,
  TablesDB,
} from 'node-appwrite';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled']);
const USER_ACTIONS = new Set(['create_job', 'check_status', 'cancel_job']);
const WORKER_ACTIONS = new Set(['worker_update']);
const MIN_PHOTOS = 12;
const MAX_PHOTOS = 96;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredEnvironment(name) {
  const value = clean(process.env[name]);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function runtimeConfiguration(req) {
  return {
    endpoint: requiredEnvironment('APPWRITE_FUNCTION_API_ENDPOINT'),
    projectId: requiredEnvironment('APPWRITE_FUNCTION_PROJECT_ID'),
    apiKey:
      clean(req.headers['x-appwrite-key']) ||
      clean(process.env.APPWRITE_FUNCTION_API_KEY),
    databaseId: requiredEnvironment('PHOTOGRAMMETRY_DATABASE_ID'),
    jobsTableId: requiredEnvironment('PHOTOGRAMMETRY_JOBS_TABLE_ID'),
    inputBucketId: requiredEnvironment('PHOTOGRAMMETRY_INPUT_BUCKET_ID'),
    outputBucketId: clean(process.env.PHOTOGRAMMETRY_OUTPUT_BUCKET_ID),
    workerUrl: clean(process.env.PHOTOGRAMMETRY_WORKER_URL),
    workerToken: clean(process.env.PHOTOGRAMMETRY_WORKER_TOKEN),
    callbackUrl: clean(process.env.PHOTOGRAMMETRY_CALLBACK_URL),
    deleteInputsOnTerminal:
      clean(process.env.PHOTOGRAMMETRY_DELETE_INPUTS_ON_TERMINAL).toLowerCase() !==
      'false',
  };
}

function createServerServices(configuration) {
  if (!configuration.apiKey) {
    throw new Error('The Appwrite dynamic function API key was not provided.');
  }

  const client = new Client()
    .setEndpoint(configuration.endpoint)
    .setProject(configuration.projectId)
    .setKey(configuration.apiKey);

  return {
    storage: new Storage(client),
    tablesDB: new TablesDB(client),
  };
}

function createUserStorage(configuration, jwt) {
  const client = new Client()
    .setEndpoint(configuration.endpoint)
    .setProject(configuration.projectId)
    .setJWT(jwt);
  return new Storage(client);
}

function requestBody(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  if (!req.bodyText) return {};

  try {
    return JSON.parse(req.bodyText);
  } catch {
    return {};
  }
}

function response(res, payload, status = 200) {
  return res.json(payload, status, {
    'cache-control': 'no-store',
  });
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

function normalizeFileIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(clean).filter(Boolean))];
}

function normalizeProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function publicJob(row) {
  return {
    id: row.$id,
    status: row.status,
    progress: normalizeProgress(row.progress),
    photoCount: Number(row.photoCount) || 0,
    ...(row.modelUrl ? { modelUrl: row.modelUrl } : {}),
    ...(row.modelFileId ? { modelFileId: row.modelFileId } : {}),
    ...(row.error ? { error: row.error } : {}),
    createdAt: row.createdAt || row.$createdAt,
    updatedAt: row.updatedAt || row.$updatedAt,
  };
}

async function getOwnedJob({ tablesDB, configuration, jobId, userId }) {
  const row = await tablesDB.getRow({
    databaseId: configuration.databaseId,
    tableId: configuration.jobsTableId,
    rowId: jobId,
  });

  if (row.ownerId !== userId) {
    const error = new Error('This photogrammetry job does not belong to the current user.');
    error.statusCode = 403;
    throw error;
  }

  return row;
}

async function validateUserFiles({ configuration, jwt, fileIds }) {
  const storage = createUserStorage(configuration, jwt);
  await Promise.all(
    fileIds.map((fileId) =>
      storage.getFile({
        bucketId: configuration.inputBucketId,
        fileId,
      }),
    ),
  );
}

async function updateJob({ tablesDB, configuration, jobId, data }) {
  return tablesDB.updateRow({
    databaseId: configuration.databaseId,
    tableId: configuration.jobsTableId,
    rowId: jobId,
    data: {
      ...data,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function dispatchWorker({ configuration, job }) {
  if (!configuration.workerUrl) {
    throw new Error('PHOTOGRAMMETRY_WORKER_URL is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const workerResponse = await fetch(configuration.workerUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(configuration.workerToken
          ? { authorization: `Bearer ${configuration.workerToken}` }
          : {}),
      },
      body: JSON.stringify({
        contractVersion: 1,
        action: 'reconstruct',
        jobId: job.$id,
        ownerId: job.ownerId,
        fileIds: job.inputFileIds,
        photoCount: job.photoCount,
        appwrite: {
          endpoint: configuration.endpoint,
          projectId: configuration.projectId,
          inputBucketId: configuration.inputBucketId,
          outputBucketId: configuration.outputBucketId || null,
        },
        callbackUrl: configuration.callbackUrl || null,
      }),
      signal: controller.signal,
    });

    const bodyText = await workerResponse.text();
    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = {};
    }

    if (!workerResponse.ok) {
      throw new Error(
        clean(body.message) ||
          `Photogrammetry worker rejected the job (${workerResponse.status}).`,
      );
    }

    return {
      workerJobId: clean(body.workerJobId) || job.$id,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function cleanupInputFiles({ storage, configuration, row, log }) {
  if (!configuration.deleteInputsOnTerminal) return;
  const fileIds = normalizeFileIds(row.inputFileIds);
  const results = await Promise.allSettled(
    fileIds.map((fileId) =>
      storage.deleteFile({
        bucketId: configuration.inputBucketId,
        fileId,
      }),
    ),
  );
  const failures = results.filter((result) => result.status === 'rejected').length;
  if (failures > 0) {
    log(`Unable to delete ${failures} photogrammetry input file(s) for ${row.$id}.`);
  }
}

async function createJob({ body, req, res, log, configuration, services, userId }) {
  const jwt = clean(req.headers['x-appwrite-user-jwt']);
  if (!jwt) {
    return response(res, { success: false, message: 'Authentication is required.' }, 401);
  }

  const fileIds = normalizeFileIds(body.fileIds);
  if (fileIds.length < MIN_PHOTOS) {
    return response(
      res,
      {
        success: false,
        message: `At least ${MIN_PHOTOS} distinct photos are required for a 3D reconstruction.`,
      },
      400,
    );
  }
  if (fileIds.length > MAX_PHOTOS) {
    return response(
      res,
      {
        success: false,
        message: `A reconstruction can contain at most ${MAX_PHOTOS} photos.`,
      },
      400,
    );
  }

  await validateUserFiles({ configuration, jwt, fileIds });

  const now = new Date().toISOString();
  const row = await services.tablesDB.createRow({
    databaseId: configuration.databaseId,
    tableId: configuration.jobsTableId,
    rowId: ID.unique(),
    data: {
      ownerId: userId,
      status: 'queued',
      progress: 0,
      photoCount: fileIds.length,
      inputFileIds: fileIds,
      workerJobId: null,
      modelUrl: null,
      modelFileId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    },
    permissions: [
      Permission.read(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ],
  });

  try {
    const dispatched = await dispatchWorker({ configuration, job: row });
    const processing = await updateJob({
      tablesDB: services.tablesDB,
      configuration,
      jobId: row.$id,
      data: {
        status: 'processing',
        progress: 1,
        workerJobId: dispatched.workerJobId,
        startedAt: now,
      },
    });

    log(`Photogrammetry job ${row.$id} dispatched with ${fileIds.length} photos.`);
    return response(res, { success: true, job: publicJob(processing) }, 201);
  } catch (error) {
    const failed = await updateJob({
      tablesDB: services.tablesDB,
      configuration,
      jobId: row.$id,
      data: {
        status: 'failed',
        progress: 0,
        error: errorMessage(error),
        completedAt: new Date().toISOString(),
      },
    });

    return response(
      res,
      {
        success: false,
        message: 'The reconstruction worker could not accept this job.',
        job: publicJob(failed),
      },
      502,
    );
  }
}

async function checkStatus({ body, res, configuration, services, userId }) {
  const jobId = clean(body.jobId);
  if (!jobId) {
    return response(res, { success: false, message: 'jobId is required.' }, 400);
  }

  const row = await getOwnedJob({
    tablesDB: services.tablesDB,
    configuration,
    jobId,
    userId,
  });
  return response(res, { success: true, job: publicJob(row) });
}

async function cancelJob({ body, res, configuration, services, userId }) {
  const jobId = clean(body.jobId);
  if (!jobId) {
    return response(res, { success: false, message: 'jobId is required.' }, 400);
  }

  const row = await getOwnedJob({
    tablesDB: services.tablesDB,
    configuration,
    jobId,
    userId,
  });

  if (TERMINAL_STATUSES.has(row.status)) {
    return response(res, { success: true, job: publicJob(row) });
  }

  const canceled = await updateJob({
    tablesDB: services.tablesDB,
    configuration,
    jobId,
    data: {
      status: 'canceled',
      error: 'Canceled by the user.',
      completedAt: new Date().toISOString(),
    },
  });

  await cleanupInputFiles({
    storage: services.storage,
    configuration,
    row: canceled,
    log: () => {},
  });

  return response(res, { success: true, job: publicJob(canceled) });
}

async function workerUpdate({ body, req, res, log, configuration, services }) {
  const expectedToken = configuration.workerToken;
  const authorization = clean(req.headers.authorization);
  if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
    return response(res, { success: false, message: 'Worker authentication failed.' }, 401);
  }

  const jobId = clean(body.jobId);
  const status = clean(body.status);
  if (!jobId || !['processing', 'completed', 'failed', 'canceled'].includes(status)) {
    return response(
      res,
      { success: false, message: 'A valid jobId and worker status are required.' },
      400,
    );
  }

  const current = await services.tablesDB.getRow({
    databaseId: configuration.databaseId,
    tableId: configuration.jobsTableId,
    rowId: jobId,
  });

  if (TERMINAL_STATUSES.has(current.status)) {
    return response(res, { success: true, job: publicJob(current) });
  }

  const modelUrl = clean(body.modelUrl);
  const modelFileId = clean(body.modelFileId);
  if (status === 'completed' && !modelUrl && !modelFileId) {
    return response(
      res,
      {
        success: false,
        message: 'A completed job must include modelUrl or modelFileId.',
      },
      400,
    );
  }

  const terminal = TERMINAL_STATUSES.has(status);
  const updated = await updateJob({
    tablesDB: services.tablesDB,
    configuration,
    jobId,
    data: {
      status,
      progress: status === 'completed' ? 100 : normalizeProgress(body.progress),
      modelUrl: modelUrl || null,
      modelFileId: modelFileId || null,
      error: status === 'failed' || status === 'canceled' ? errorMessage(body.error || status) : null,
      ...(terminal ? { completedAt: new Date().toISOString() } : {}),
    },
  });

  if (terminal) {
    await cleanupInputFiles({
      storage: services.storage,
      configuration,
      row: updated,
      log,
    });
  }

  return response(res, { success: true, job: publicJob(updated) });
}

export default async ({ req, res, log, error }) => {
  if (req.method !== 'POST') {
    return response(res, { success: false, message: 'Use POST.' }, 405);
  }

  const body = requestBody(req);
  const action = clean(body.action);

  try {
    const configuration = runtimeConfiguration(req);
    const services = createServerServices(configuration);

    if (WORKER_ACTIONS.has(action)) {
      return await workerUpdate({ body, req, res, log, configuration, services });
    }

    const userId = clean(req.headers['x-appwrite-user-id']);
    if (!USER_ACTIONS.has(action)) {
      return response(res, { success: false, message: 'Unsupported action.' }, 400);
    }
    if (!userId) {
      return response(res, { success: false, message: 'Authentication is required.' }, 401);
    }

    if (action === 'create_job') {
      return await createJob({
        body,
        req,
        res,
        log,
        configuration,
        services,
        userId,
      });
    }
    if (action === 'check_status') {
      return await checkStatus({ body, res, configuration, services, userId });
    }
    return await cancelJob({ body, res, configuration, services, userId });
  } catch (caught) {
    error(errorMessage(caught));
    const status = Number(caught?.statusCode) || 500;
    return response(
      res,
      {
        success: false,
        message: status >= 500 ? 'The photogrammetry backend encountered an error.' : errorMessage(caught),
      },
      status,
    );
  }
};
