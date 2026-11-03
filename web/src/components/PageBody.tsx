import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|[\w.+-]+@[\w-]+\.[\w.-]*\w)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (link) {
      const [, label, href] = link;
      if (href.startsWith("/") && !href.startsWith("//")) return <Link key={index} to={href}>{label}</Link>;
      if (/^(https?:|mailto:)/.test(href)) return <a key={index} href={href}>{label}</a>;
      return <Fragment key={index}>{label}</Fragment>;
    }
    if (/^[\w.+-]+@[\w-]+\.[\w.-]*\w$/.test(part)) return <a key={index} href={`mailto:${part}`}>{part}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

// Renders merchant-edited page text: "## " headings, "- " lists, **bold** and [links](/path).
// Everything becomes React elements, so nothing typed here can inject markup.
export function PageBody({ body }: { body: string }) {
  return (
    <div className="page-body">
      {body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((block, index) => {
        const text = block.trim();
        if (!text) return null;
        if (text.startsWith("## ")) return <h2 key={index}>{inline(text.slice(3))}</h2>;
        const lines = text.split("\n");
        if (lines.every((line) => line.startsWith("- "))) {
          return <ul key={index}>{lines.map((line, item) => <li key={item}>{inline(line.slice(2))}</li>)}</ul>;
        }
        return <p key={index}>{inline(lines.join(" "))}</p>;
      })}
    </div>
  );
}
