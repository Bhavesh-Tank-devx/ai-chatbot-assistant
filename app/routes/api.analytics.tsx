import type { ActionFunctionArgs } from "react-router";

/**
 * API endpoint to receive customer behavior events from the Web Pixel extension
 *
 * Events include:
 * - product_viewed
 * - collection_viewed
 * - cart_viewed
 * - product_added_to_cart
 * - product_removed_from_cart
 * - checkout_started
 * - checkout_completed
 * - search_submitted
 * - page_viewed
 */
export async function action({ request }: ActionFunctionArgs) {
  // Set CORS headers to allow requests from Shopify pixel sandbox
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, { headers, status: 204 });
  }

  try {
    // Parse the incoming event payload
    const payload = await request.json();

    const { eventName, timestamp, shopDomain, sessionId, data } = payload;

    // Enhanced logging with quantity and engagement details
    const logData: any = {
      eventName,
      timestamp,
      shopDomain,
      sessionId,
    };

    // Add specific details based on event type
    if (
      eventName === "product_added_to_cart" ||
      eventName === "product_removed_from_cart"
    ) {
      logData.quantity = data.quantity;
      logData.product = data.productTitle;
      logData.action =
        eventName === "product_added_to_cart"
          ? `+${data.quantity}`
          : `-${data.quantity}`;
    } else if (eventName === "product_dwell_time") {
      logData.dwellTimeSeconds = data.dwellTimeSeconds;
      logData.engagement = data.engagementLevel;
    } else if (eventName === "product_viewed") {
      logData.product = data.productTitle;
      logData.price = data.price;
    }

    // Add truncated data preview
    logData.dataPreview = JSON.stringify(data).substring(0, 100);

    console.log("[Analytics Event]", logData);

    // TODO: Send to your backend pipeline
    // Example:
    // - Push to Redis Pub/Sub
    // - Store in database
    // - Send to AWS Bedrock for processing
    // - Update session context for AI chatbot

    // For now, just acknowledge receipt
    return new Response(
      JSON.stringify({ success: true, message: "Event received" }),
      {
        headers: { ...headers, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("[Analytics Error]", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to process event" }),
      {
        headers: { ...headers, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
}

// Disallow GET requests but return CORS headers for OPTIONS
export async function loader({ request }: { request: Request }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 405,
  });
}
