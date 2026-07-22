import fs from "node:fs";

const path = new URL("../services/ebaySoldCompsService.ts", import.meta.url);
let source = fs.readFileSync(path, "utf8");

const helpers = `
const TERMINAL_EBAY_EXECUTION_STATUSES = new Set(["completed", "failed"]);

async function waitForEbayFunctionExecution(initialExecution: any) {
  let execution = initialExecution;

  while (true) {
    const status = String(execution?.status || "").toLowerCase();

    if (TERMINAL_EBAY_EXECUTION_STATUSES.has(status)) {
      return execution;
    }

    await sleep(POLL_INTERVAL_MS);
    execution = await functions.getExecution({
      functionId: APPWRITE.ebaySoldCompsFunctionId,
      executionId: execution.$id,
    });
  }
}
`;

if (!source.includes("waitForEbayFunctionExecution")) {
  const marker = "const POLL_INTERVAL_MS = 2500;";
  if (!source.includes(marker)) {
    throw new Error("Could not locate the eBay polling constant.");
  }
  source = source.replace(marker, `${marker}\n${helpers}`);
}

const oldBlock = `  const execution = await functions.createExecution({
    functionId: APPWRITE.ebaySoldCompsFunctionId,
    async: false,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });`;

const newBlock = `  const startedExecution = await functions.createExecution({
    functionId: APPWRITE.ebaySoldCompsFunctionId,
    async: true,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const execution = await waitForEbayFunctionExecution(startedExecution);`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
} else if (!source.includes(newBlock)) {
  throw new Error("Could not locate the synchronous eBay function execution.");
}

source = source.replace(
  `  if (!rawBody) {
    throw new Error(
      "eBay research completed without a response. Check the Appwrite Function execution log."
    );
  }`,
  `  if (!rawBody) {
    const executionError =
      typeof execution.errors === "string" ? execution.errors.trim() : "";
    throw new Error(
      executionError ||
        "eBay research completed without a response. Check the Appwrite Function execution log."
    );
  }`,
);

if (!source.includes("async: true")) {
  throw new Error("The eBay function is not using asynchronous execution.");
}
if (!source.includes("waitForEbayFunctionExecution(startedExecution)")) {
  throw new Error("The eBay function execution poller was not installed.");
}

fs.writeFileSync(path, source, "utf8");
console.log("eBay Appwrite calls now run asynchronously and poll without a client deadline.");
