import type { ActionFunctionArgs } from "react-router";

// URL of the chatbot Gateway service that processes behavior events
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:3000";

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
    } else if (eventName === "cart_viewed") {
      logData.lineItemCount = data.lineItemCount; // distinct products
      logData.totalQuantity = data.totalQuantity; // total units in cart
      logData.totalPrice = data.totalPrice;
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

    // Forward event to the chatbot Gateway for session context enrichment.
    // Fire-and-forget so we never block the Shopify pixel response.
    fetch(`${GATEWAY_URL}/shopify/behavior`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        timestamp,
        shopDomain,
        sessionId,
        data,
      }),
    }).catch((err) => {
      console.error("[Analytics] Failed to forward event to Gateway:", err);
    });

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
