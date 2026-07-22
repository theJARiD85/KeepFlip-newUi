import fs from "node:fs";

const servicePath = new URL(
  "../services/itemAiOptimizedService.ts",
  import.meta.url,
);
let source = fs.readFileSync(servicePath, "utf8");

const oldBlock = `async function waitForItemAiExecution(initialExecution: any) {
  let execution = initialExecution;

  while (true) {
    const status = String(execution?.status || "").toLowerCase();

    if (TERMINAL_FUNCTION_STATUSES.has(status)) {
      return execution;
    }

    await sleep(FUNCTION_EXECUTION_POLL_INTERVAL_MS);
    execution = await functions.getExecution({
      functionId: APPWRITE.itemAiFunctionId,
      executionId: execution.$id,
    });
  }
}`;

const newBlock = `function executionErrorDetails(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;

  return {
    name: String(record?.name || typeof error),
    message: String(record?.message || error || "Unknown execution error"),
    code: Number(record?.code || 0) || null,
    type: String(record?.type || ""),
    status: Number(record?.status || 0) || null,
  };
}

function isExecutionNotFound(error: unknown) {
  const details = executionErrorDetails(error);
  return (
    details.code === 404 ||
    details.status === 404 ||
    details.type === "execution_not_found" ||
    /execution with the requested id could not be found/i.test(
      details.message,
    )
  );
}

async function waitForItemAiExecution(initialExecution: any) {
  let execution = initialExecution;
  const executionId = String(initialExecution?.$id || "").trim();
  let notFoundAttempts = 0;
  let pollAttempt = 0;

  if (!executionId) {
    throw new Error(
      "Appwrite started item analysis without returning an execution ID.",
    );
  }

  while (true) {
    const status = String(execution?.status || "").toLowerCase();

    if (TERMINAL_FUNCTION_STATUSES.has(status)) {
      return execution;
    }

    pollAttempt += 1;
    await sleep(FUNCTION_EXECUTION_POLL_INTERVAL_MS);

    try {
      execution = await functions.getExecution({
        functionId: APPWRITE.itemAiFunctionId,
        executionId,
      });
      notFoundAttempts = 0;
    } catch (error) {
      const details = executionErrorDetails(error);

      if (isExecutionNotFound(error)) {
        notFoundAttempts += 1;
        if (
          notFoundAttempts === 1 ||
          notFoundAttempts % 5 === 0
        ) {
          console.warn(
            "KeepFlip item-AI execution is not visible yet; continuing to poll.",
            {
              executionId,
              pollAttempt,
              notFoundAttempts,
              ...details,
            },
          );
        }
        continue;
      }

      console.error("KeepFlip item-AI execution polling failed.", {
        executionId,
        pollAttempt,
        ...details,
      });
      throw error;
    }
  }
}`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
} else if (!source.includes("isExecutionNotFound(error")) {
  throw new Error("Could not locate the item-AI execution polling block.");
}

if (!source.includes("continuing to poll")) {
  throw new Error("Execution-not-found retry behavior was not installed.");
}

fs.writeFileSync(servicePath, source, "utf8");
console.log("Item-AI polling now tolerates transient execution_not_found responses.");
