import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { MissionMarquee } from "../components/MissionMarquee";
import { Failure, Loading, Meta, Signup } from "../components/Shared";
import { PuzzleHero } from "../puzzle/PuzzleHero";
import { VillagePiece } from "../puzzle/VillagePiece";
import { CoreCollection, DropFeature, HomeStory } from "./Home";

/**
 * The puzzle home: the classic home with the map puzzle as its first screen and a village finder
 * built from the same pieces. The hero needs no catalog data to start, so it never waits on it.
 */
export function PuzzleHome() {
  const q = useQuery({ queryKey: ["storefront"], queryFn: api.storefront });
  const drop = q.data?.featured_drop ?? null;
  const products = q.data?.core_products ?? [];
  return (
    <div className="home puzzle-home">
      <Meta title="A Piece of Home." />
      <PuzzleHero drop={drop} core={products} />
      <MissionMarquee />
      {q.data ? (
        <>
          <CoreCollection products={products} />
          {drop && <DropFeature drop={drop} />}
          <VillagePiece />
          <HomeStory />
          {/* An upcoming drop carries its own alert form above; every other state ends with the general list. */}
          {drop?.state !== "upcoming" && <div className="home-section home-signup"><Signup /></div>}
        </>
      ) : q.isPending ? (
        <Loading layout="collection" />
      ) : (
        <Failure error={q.error ?? new Error("Unavailable")} retry={() => void q.refetch()} />
      )}
    </div>
  );
}
