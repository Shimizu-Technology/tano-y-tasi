import { Link, useLocation } from "react-router";
import { lookNames, useLook, type Look } from "./look";

export function PreviewBar() {
  const look = useLook();
  const location = useLocation();
  if (!look || /^\/admin(?:\/|$)/.test(location.pathname)) return null;
  const href = (value: Look | "off") => {
    const params = new URLSearchParams(location.search);
    params.set("look", value);
    return `${location.pathname}?${params}${location.hash}`;
  };
  return <nav className="look-preview-bar" aria-label="Design preview">
    <span>Preview</span>
    {(["1", "2", "3", "4"] as const).map((value) => <Link key={value} to={href(value)} aria-current={look === value ? "true" : undefined}>Look {value} <span>{lookNames[value]}</span></Link>)}
    <Link to={href("off")}>Exit</Link>
  </nav>;
}
