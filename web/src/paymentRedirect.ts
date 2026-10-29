export function paymentRedirect(paymentUrl: string): string | null {
  try {
    const url = new URL(paymentUrl, window.location.origin);
    if (url.username || url.password) return null;
    if (url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.port) return url.href;
    if (
      import.meta.env.DEV &&
      url.origin === window.location.origin &&
      /^\/checkout\/simulated\/[A-Za-z0-9_-]+$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    )
      return url.href;
  } catch {
    /* Invalid provider URLs stay in the cart. */
  }
  return null;
}
