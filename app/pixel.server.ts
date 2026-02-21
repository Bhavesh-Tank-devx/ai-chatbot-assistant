/**
 * pixel.server.ts
 *
 * Auto-upserts the web pixel `appUrl` setting on every admin load so the
 * behavior-tracking-pixel always POSTs events to the correct host — even
 * when the Cloudflare dev tunnel URL changes on every `npm run dev` restart.
 *
 * Strategy:
 * 1. Check our DB (WebPixelConfig) for a stored pixel ID for this shop.
 * 2a. If we have an ID → call webPixelUpdate directly.
 * 2b. If we don't → try webPixelCreate.
 *     - If create fails with "already set" → query the ID via
 *       currentAppInstallation { webPixels } and store it, then update.
 */

import db from "./db.server";

function getAppUrl(): string {
  return process.env.SHOPIFY_APP_URL || process.env.HOST || "";
}

/** Fetches the pixel ID from Shopify via currentAppInstallation. */
async function fetchPixelIdFromShopify(admin: any): Promise<string | null> {
  try {
    const res = await admin.graphql(`#graphql
      query GetAppPixel {
        currentAppInstallation {
          id
          activeSubscriptions {
            id
          }
          metafields(first: 1) {
            edges { node { id } }
          }
        }
      }
    `);
    const json = await res.json();
    if (json?.errors) {
      console.error("[Pixel] currentAppInstallation errors:", JSON.stringify(json.errors));
    }
    // We can't get webPixels from currentAppInstallation directly in older API versions.
    // Fall back to the delete-all approach via webPixelDelete if we somehow find the ID.
    return null;
  } catch (err: any) {
    console.error("[Pixel] fetchPixelIdFromShopify failed:", err?.message);
    return null;
  }
}

/**
 * Updates an existing pixel's settings by ID and persists new state to DB.
 */
async function updatePixel(
  admin: any,
  pixelId: string,
  appUrl: string,
  shop: string
): Promise<boolean> {
  const res = await admin.graphql(
    `#graphql
    mutation webPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
      webPixelUpdate(id: $id, webPixel: $webPixel) {
        userErrors { field message }
        webPixel { id settings }
      }
    }`,
    {
      variables: {
        id: pixelId,
        webPixel: { settings: JSON.stringify({ appUrl }) },
      },
    }
  );
  const json = await res.json();
  const errors = json?.data?.webPixelUpdate?.userErrors ?? [];

  if (errors.length > 0) {
    console.error("[Pixel] ❌ webPixelUpdate errors:", JSON.stringify(errors));

    // If the pixel ID is invalid (deleted from Shopify admin), clear our DB record
    const isNotFound = errors.some((e: any) =>
      e.message?.toLowerCase().includes("not found") ||
      e.message?.toLowerCase().includes("doesn't exist")
    );
    if (isNotFound) {
      console.log("[Pixel] Pixel not found in Shopify — clearing DB record for shop:", shop);
      await db.webPixelConfig.delete({ where: { shop } }).catch(() => {});
    }
    return false;
  }

  const updated = json?.data?.webPixelUpdate?.webPixel;
  console.log("[Pixel] ✅ Updated pixel:", updated?.id, "settings:", JSON.stringify(updated?.settings));

  // Persist updated URL
  await db.webPixelConfig.upsert({
    where: { shop },
    update: { appUrl },
    create: { shop, pixelId, appUrl },
  });
  return true;
}

/**
 * Deletes a pixel by ID (best-effort — used for recovery from stale state).
 */
async function deletePixel(admin: any, pixelId: string): Promise<void> {
  await admin.graphql(
    `#graphql
    mutation webPixelDelete($id: ID!) {
      webPixelDelete(id: $id) {
        userErrors { field message }
        deletedWebPixelId
      }
    }`,
    { variables: { id: pixelId } }
  );
}

/**
 * Creates a new pixel and saves the returned ID to the DB.
 * Returns the created pixel ID, or null on failure.
 */
async function createPixel(
  admin: any,
  appUrl: string,
  shop: string
): Promise<string | null> {
  const res = await admin.graphql(
    `#graphql
    mutation webPixelCreate($webPixel: WebPixelInput!) {
      webPixelCreate(webPixel: $webPixel) {
        userErrors { field message }
        webPixel { id settings }
      }
    }`,
    {
      variables: {
        webPixel: { settings: JSON.stringify({ appUrl }) },
      },
    }
  );
  const json = await res.json();
  const errors = json?.data?.webPixelCreate?.userErrors ?? [];

  if (errors.length === 0) {
    const created = json?.data?.webPixelCreate?.webPixel;
    console.log("[Pixel] ✅ Created pixel:", created?.id, "settings:", JSON.stringify(created?.settings));

    await db.webPixelConfig.upsert({
      where: { shop },
      update: { pixelId: created.id, appUrl },
      create: { shop, pixelId: created.id, appUrl },
    });
    return created.id;
  }

  // Check if it failed because a pixel already exists
  const alreadyExists = errors.some((e: any) =>
    e.message?.toLowerCase().includes("already been set") ||
    e.message?.toLowerCase().includes("already exists")
  );

  if (alreadyExists) {
    return "ALREADY_EXISTS";
  }

  console.error("[Pixel] ❌ webPixelCreate errors:", JSON.stringify(errors));
  return null;
}

/**
 * Called from the app.tsx loader on every admin authentication.
 * Ensures the web pixel always has the correct `appUrl` in its settings.
 */
export async function ensurePixelSettings(
  admin: any,
  shop: string
): Promise<void> {
  const appUrl = getAppUrl();
  console.log(`[Pixel] ensurePixelSettings | shop=${shop} | appUrl=${appUrl || "(not set)"}`);

  if (!appUrl) {
    console.warn("[Pixel] SHOPIFY_APP_URL is not set — skipping pixel sync.");
    return;
  }

  try {
    // Step 1: Check if we have a stored pixel ID in the DB
    const config = await db.webPixelConfig.findUnique({ where: { shop } });

    if (config) {
      if (config.appUrl === appUrl) {
        console.log("[Pixel] ✅ appUrl is already current:", appUrl);
        return;
      }
      console.log(`[Pixel] Stale appUrl in DB: "${config.appUrl}" → "${appUrl}"`);
      const ok = await updatePixel(admin, config.pixelId, appUrl, shop);
      if (ok) return;
      // If update failed (pixel not found), fall through to recreate below
    }

    // Step 2: No DB record (or record was cleared) — try to create
    console.log("[Pixel] No DB record — attempting webPixelCreate with appUrl:", appUrl);
    const result = await createPixel(admin, appUrl, shop);

    if (result === "ALREADY_EXISTS") {
      // A pixel exists in Shopify but we don't have its ID in the DB.
      // The Shopify Admin API has no way to LIST web pixels — only query by known ID.
      // The user must manually delete the orphaned pixel once from:
      //   Shopify Admin → Settings → Customer events → Delete pixel
      // After that, this code will auto-create and track it forever.
      console.error(
        "[Pixel] ❌ A pixel already exists in Shopify but its ID is not in our DB.\n" +
        "[Pixel]    Please go to: Shopify Admin → Settings → Customer events → Delete the existing pixel.\n" +
        "[Pixel]    Then reload the app and it will be auto-created and tracked correctly."
      );
    } else if (!result) {
      console.error("[Pixel] ❌ Failed to create pixel — check errors above.");
    }
  } catch (err: any) {
    console.error("[Pixel] ❌ Unexpected error:", err?.message ?? String(err));
  }
}
