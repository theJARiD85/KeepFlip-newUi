function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  
  export function requiredEnv(name) {
    const value = clean(process.env[name]);
  
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  
    return value;
  }
  
  export const config = {
    appwriteEndpoint: requiredEnv("APPWRITE_ENDPOINT").replace(/\/$/, ""),
    appwriteProjectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
  
    databaseId: requiredEnv("KEEPFLIP_DATABASE_ID"),
    itemsTableId: requiredEnv("KEEPFLIP_ITEMS_TABLE_ID"),
  
    openaiApiKey: requiredEnv("OPENAI_API_KEY"),
    listingModel:
      clean(process.env.OPENAI_LISTING_MODEL) || "gpt-4.1-mini",
  };