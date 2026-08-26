import OpenAI from "openai";

import { config } from "./config.js";
import { LISTING_GENERATOR_SCHEMA } from "./listingSchema.js";

function createOpenAIClient() {
  return new OpenAI({
    apiKey: config.openaiApiKey,
  });
}

function parseStructuredOutput(response, label) {
  const text =
    response.output_text ||
    response.output?.[0]?.content?.[0]?.text;

  if (!text) {
    throw new Error(`${label} did not return a result.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned unreadable structured data.`);
  }
}

function itemSummary(item) {
  return {
    id: item.$id,
    title: item.title || null,
    brand: item.brand || null,
    model: item.model || null,
    category: item.category || null,
    condition: item.condition || null,
    description: item.description || null,
  };
}

export async function generateListing({
  item,
  flipDecision,
  diagnosis,
  partsResearch,
}) {
  const openai = createOpenAIClient();

  const response = await openai.responses.create({
    model: config.listingModel,
    input: [
      {
        role: "system",
        content: `
You are KeepFlip, an AI resale listing assistant.

Your job is to turn a private item into a clear, honest, optimized resale listing.

Primary goal:
Help the seller maximize resale value without hiding defects.

Rules:
- Never hide defects.
- Never exaggerate condition.
- Never claim the item works perfectly unless the provided condition proves it.
- If the item is broken, unsafe, untested, incomplete, or not fully functional, use conditionLabel "for_parts_or_repair".
- Use "repair_first" only when repair appears likely to improve profit.
- Use "sell_as_is" when repair is not clearly worth it.
- Use "clean_and_list" when the item appears functional and mainly needs presentation improvements.
- Use "bundle" when accessories or related items would likely improve sale appeal.
- Use "part_out" when the item appears more valuable as components than as one item.
- Avoid saying "rare" unless the input clearly supports it.
- Avoid luxury claims unless brand and model support it.
- Keep the title searchable and concise.
- Include brand, model, item type, size, color, condition, and accessories when available.
- Price conservatively if information is incomplete.
- Pricing is an estimate, not a guarantee.
- Platform copy should be ready to paste into each marketplace.
- Return only valid JSON matching the schema.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            item: itemSummary(item),
            flipDecision: flipDecision || null,
            diagnosis: diagnosis || null,
            partsResearch: partsResearch || null,
          },
          null,
          2
        ),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "keepflip_listing_generator",
        strict: true,
        schema: LISTING_GENERATOR_SCHEMA,
      },
    },
  });

  return parseStructuredOutput(response, "Listing generator");
}