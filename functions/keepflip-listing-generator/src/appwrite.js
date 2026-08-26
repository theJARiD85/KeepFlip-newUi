import {
    Client,
    TablesDB,
  } from "node-appwrite";
  
  import { config } from "./config.js";
  
  export function createHttpError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }
  
  export function getHeader(req, headerName) {
    const headers = req.headers || {};
    const target = headerName.toLowerCase();
  
    return (
      headers[headerName] ||
      headers[target] ||
      Object.entries(headers).find(
        ([key]) => key.toLowerCase() === target
      )?.[1] ||
      null
    );
  }
  
  function createBaseClient() {
    return new Client()
      .setEndpoint(config.appwriteEndpoint)
      .setProject(config.appwriteProjectId);
  }
  
  function createUserClient(req) {
    const jwt = getHeader(req, "x-appwrite-user-jwt");
  
    if (!jwt) {
      throw createHttpError(
        "You must be signed in before generating a listing.",
        401
      );
    }
  
    return createBaseClient().setJWT(jwt);
  }
  
  export async function getOwnedItem(req, userId, itemId) {
    const tablesDB = new TablesDB(createUserClient(req));
  
    const item = await tablesDB.getRow({
      databaseId: config.databaseId,
      tableId: config.itemsTableId,
      rowId: itemId,
    });
  
    if (item.ownerId !== userId) {
      throw createHttpError(
        "You do not have access to this item.",
        403
      );
    }
  
    return item;
  }