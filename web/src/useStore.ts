import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { brand } from "./brand";

// Merchant-edited store settings. The bundled brand copy shows until they load, or if they can't.
export function useStoreSettings() {
  const q = useQuery({ queryKey: ["store"], queryFn: api.store, staleTime: 5 * 60_000 });
  const store = q.data?.store;
  return {
    tagline: store?.tagline || brand.tagline,
    mission: store?.mission_lines?.length ? store.mission_lines : brand.mission,
    secondaryTagline: store ? store.secondary_tagline : brand.secondaryTagline,
    story: store?.story || brand.story,
    storyHeading: brand.storyHeading,
    contactEmail: store?.contact_email ?? null,
    isPending: q.isPending,
  };
}
