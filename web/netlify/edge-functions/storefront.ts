import { enhanceResponse } from "../lib/storefront.ts";

// Structural types keep the transformation and its tests independent of Deno.
declare const Netlify: { env: { get(name: string): string | undefined } };
export default async function storefront(request: Request, context: { next(): Promise<Response> }) {
  return enhanceResponse(request, await context.next(), {
    apiUrl: Netlify.env.get("STOREFRONT_API_URL"),
    siteUrl: Netlify.env.get("STOREFRONT_SITE_URL"),
  });
}
export const config = {
  pattern: "^/(?:$|shop/?$|drop/?$|story/?$|archive/?$|(?:products|drops)/[a-z0-9-]+/?$|info/(?:shipping|faq|contact)/?$)",
  method: "GET",
  cache: "manual",
  onError: "bypass",
};
