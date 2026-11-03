// The rounded Tåno Tåsi logo. 240/480/960 wide derivatives; `sizes` tells the browser how big it renders.
const widths = [240, 480, 960];
export function Emblem({ sizes, className = "", priority = false, width = 240 }: { sizes: string; className?: string; priority?: boolean; width?: number }) {
  return (
    <img
      className={className}
      src="/images/brand/logo-emblem-480.webp"
      srcSet={widths.map((w) => `/images/brand/logo-emblem-${w}.webp ${w}w`).join(", ")}
      sizes={sizes}
      width={width}
      height={Math.round(width * 0.825)}
      alt="Tåno Tåsi, land and sea"
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
