import {register} from "@shopify/web-pixels-extension";

interface BehaviorEventPayload {
  eventName: string;
  timestamp: string;
  shopDomain: string;
  sessionId?: string;
  data: any;
}

register(async ({ analytics, browser, init }) => {
  // Get shop domain from init context
  const shopDomain = init.context?.document?.location?.hostname || 'unknown';
  
  // Generate or retrieve a session ID from browser cookie
  let sessionId = await browser.cookie.get('ai_chatbot_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await browser.cookie.set('ai_chatbot_session_id', sessionId);
  }

  /**
   * Send event to backend API
   * Using keepalive: true to ensure requests complete even if user navigates away
   */
  function sendEvent(payload: BehaviorEventPayload) {
    try {
      // In development, use the Cloudflare tunnel URL
      // In production, this would be your app's actual domain
      const endpoint = 'https://pushed-relationship-brighton-bands.trycloudflare.com/api/analytics';
      
      fetch(endpoint, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).catch((err) => {
        // Silently fail - pixels should not break storefront
        console.error('[AI Chatbot Pixel] Error sending event:', err);
      });
    } catch (err) {
      console.error('[AI Chatbot Pixel] Error in sendEvent:', err);
    }
  }

  /**
   * Subscribe to product_viewed event
   * Triggered when a customer views a product detail page
   */
  analytics.subscribe('product_viewed', (event) => {
    sendEvent({
      eventName: 'product_viewed',
      timestamp: new Date().toISOString(),
      shopDomain,
      sessionId,
      data: {
        productId: event.data?.productVariant?.product?.id,
        productTitle: event.data?.productVariant?.product?.title,
        variantId: event.data?.productVariant?.id,
        variantTitle: event.data?.productVariant?.title,
        price: event.data?.productVariant?.price?.amount,
        currency: event.data?.productVariant?.price?.currencyCode,
      },
    });
  });

  /**
   * Subscribe to collection_viewed event
   * Triggered when a customer views a collection page
   */
  analytics.subscribe('collection_viewed', (event) => {
    sendEvent({
      eventName: 'collection_viewed',
      timestamp: new Date().toISOString(),
      shopDomain,
      sessionId,
      data: {
        collectionId: event.data?.collection?.id,
        collectionTitle: event.data?.collection?.title,
      },
    });
  });

  /**
   * Subscribe to cart_viewed event
   * Triggered when a customer views their cart
   */
  analytics.subscribe('cart_viewed', (event) => {
    sendEvent({
      eventName: 'cart_viewed',
      timestamp: new Date().toISOString(),
      shopDomain,
      sessionId,
      data: {
        cartId: event.data?.cart?.id,
        totalPrice: event.data?.cart?.cost?.totalAmount?.amount,
        currency: event.data?.cart?.cost?.totalAmount?.currencyCode,
        lineItemCount: event.data?.cart?.lines?.length || 0,
      },
    });
  });

  /**
   * Subscribe to product_added_to_cart event
   * Triggered when a product is added to cart
   */
  analytics.subscribe('product_added_to_cart', (event) => {
    sendEvent({
      eventName: 'product_added_to_cart',
      timestamp: new Date().toISOString(),
      shopDomain,
      sessionId,
      data: {
        productId: event.data?.cartLine?.merchandise?.product?.id,
        productTitle: event.data?.cartLine?.merchandise?.product?.title,
        variantId: event.data?.cartLine?.merchandise?.id,
        quantity: event.data?.cartLine?.quantity,
        price: event.data?.cartLine?.merchandise?.price?.amount,
        currency: event.data?.cartLine?.merchandise?.price?.currencyCode,
      },
    });
  });

  /**
   * Subscribe to product_removed_from_cart event
   * Triggered when a product is removed from cart
   */
  analytics.subscribe('product_removed_from_cart', (event) => {
    sendEvent({
      eventName: 'product_removed_from_cart',
      timestamp: new Date().toISOString(),
      shopDomain,
      sessionId,
      data: {
        productId: event.data?.cartLine?.merchandise?.product?.id,
        productTitle: event.data?.cartLine?.merchandise?.product?.title,
        variantId: event.data?.cartLine?.merchandise?.id,
        quantity: event.data?.cartLine?.quantity,
      },
    });
  });

  /**
   * Subscribe to checkout_started event
   * Triggered when a customer begins checkout
   */
  analytics.subscribe('checkout_started', (event) => {
    sendEvent({
      eventName: 'checkout_started',
      timestamp: new Date().toISOString(),
      shopDomain,
      sessionId,
      data: {
        checkoutToken: event.data?.checkout?.token,
        totalPrice: event.data?.checkout?.totalPrice?.amount,
        currency: event.data?.checkout?.currencyCode,
        lineItemCount: event.data?.checkout?.lineItems?.length || 0,
      },
    });
  });

  /**
   * Subscribe to checkout_completed event
   * Triggered when a customer completes checkout (purchases)
   */
  analytics.subscribe('checkout_completed', (event) => {
    sendEvent({
      eventName: 'checkout_completed',
      timestamp: new Date().toISOString(),
      shopDomain,
      sessionId,
      data: {
        checkoutToken: event.data?.checkout?.token,
        orderId: event.data?.checkout?.order?.id,
        totalPrice: event.data?.checkout?.totalPrice?.amount,
        currency: event.data?.checkout?.currencyCode,
      },
    });
  });

  /**
   * Subscribe to search_submitted event
   * Triggered when a customer submits a search query
   */
  analytics.subscribe('search_submitted', (event) => {
    sendEvent({
      eventName: 'search_submitted',
      timestamp: new Date().toISOString(),
      shopDomain,
      sessionId,
      data: {
        searchQuery: event.data?.searchResult?.query,
      },
    });
  });

  /**
   * Subscribe to page_viewed event
   * Triggered on every page view
   */
  analytics.subscribe('page_viewed', (event) => {
    sendEvent({
      eventName: 'page_viewed',
      timestamp: new Date().toISOString(),
      shopDomain,
      sessionId,
      data: {
        url: event.context?.document?.location?.href,
        path: event.context?.document?.location?.pathname,
        title: event.context?.document?.title,
        referrer: event.context?.document?.referrer,
      },
    });
  });
});
