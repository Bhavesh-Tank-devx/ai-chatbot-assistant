import type { ActionFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * This route activates the behavior-tracking-pixel web pixel extension
 * by calling the webPixelCreate GraphQL mutation
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // The app URL is injected into the pixel's init.settings so the pixel
  // always knows which host to POST events to — no hardcoding needed.
  const appUrl =
    process.env.SHOPIFY_APP_URL ||
    process.env.HOST ||
    "https://california-worcester-gnome-via.trycloudflare.com";

  try {
    // GraphQL mutation to create/activate the web pixel
    const response = await admin.graphql(
      `#graphql
      mutation webPixelCreate($webPixel: WebPixelInput!) {
        webPixelCreate(webPixel: $webPixel) {
          userErrors {
            field
            message
          }
          webPixel {
            id
            settings
          }
        }
      }`,
      {
        variables: {
          webPixel: {
            settings: JSON.stringify({ appUrl }),
          },
        },
      },
    );

    const data = await response.json();

    if (data.data.webPixelCreate.userErrors?.length > 0) {
      console.error(
        "[Pixel Activation] Errors:",
        data.data.webPixelCreate.userErrors,
      );
      return {
        success: false,
        errors: data.data.webPixelCreate.userErrors,
      };
    }

    console.log(
      "[Pixel Activation] Success!",
      data.data.webPixelCreate.webPixel,
    );

    return {
      success: true,
      pixel: data.data.webPixelCreate.webPixel,
      message:
        "Web pixel activated successfully! Check Settings → Customer events to verify.",
    };
  } catch (error) {
    console.error("[Pixel Activation] Error:", error);
    return {
      success: false,
      error: String(error),
    };
  }
};

/**
 * Simple page to activate the web pixel extension
 */
export default function ActivatePixel() {
  const fetcher = useFetcher<typeof action>();
  const isLoading = fetcher.state === "submitting";

  return (
    <s-page heading="Activate Behavior Tracking Pixel">
      <s-section heading="Web Pixel Extension Activation">
        <s-paragraph>
          Click the button below to activate the{" "}
          <strong>behavior-tracking-pixel</strong> extension. This will connect
          the pixel to your store and start tracking customer events.
        </s-paragraph>

        {fetcher.data?.success && (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>{fetcher.data.message}</s-paragraph>
            <s-paragraph>
              Pixel ID: <code>{fetcher.data.pixel?.id}</code>
            </s-paragraph>
            <s-paragraph>Verify at: Settings → Customer events</s-paragraph>
          </s-box>
        )}

        {fetcher.data?.success === false && (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>Failed to activate pixel:</s-paragraph>
            {fetcher.data.errors?.map((error: any, i: number) => (
              <s-paragraph key={i}>
                • {error.field}: {error.message}
              </s-paragraph>
            ))}
            {fetcher.data.error && (
              <s-paragraph>• {fetcher.data.error}</s-paragraph>
            )}
          </s-box>
        )}

        <fetcher.Form method="post">
          <s-button
            variant="primary"
            type="submit"
            {...(isLoading ? { loading: true } : {})}
          >
            {isLoading ? "Activating..." : "Activate Pixel"}
          </s-button>
        </fetcher.Form>
      </s-section>
    </s-page>
  );
}
