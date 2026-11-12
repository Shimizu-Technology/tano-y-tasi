import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Upload, X } from "lucide-react";
import { AdminApiError, useAdminApi, type AdminImage, type AdminProduct, type UploadGrant } from "./adminApi";
import { ImageRejected, WEBP, prepareImage, putImage } from "./imagePipeline";
import { Field, Notice, issue } from "./AdminPages";

const roles: { value: string; label: string }[] = [
  { value: "hero", label: "Main image" },
  { value: "gallery", label: "Gallery" },
  { value: "detail", label: "Close-up" },
  { value: "box", label: "Box" },
  { value: "lifestyle", label: "In use" },
  // The four flat faces the storefront folds into a box that turns. It needs a front and a back.
  { value: "box_front", label: "Box that turns: front" },
  { value: "box_back", label: "Box that turns: back" },
  { value: "box_left", label: "Box that turns: left side" },
  { value: "box_right", label: "Box that turns: right side" },
];
type Item = AdminImage & { key: string; preview?: string };
type Row = {
  id: string;
  file: File;
  status: "working" | "failed";
  step: string;
  done: number;
  total: number;
  error?: string;
  retry?: boolean;
  preview?: string;
};
let nextKey = 0;
const withKey = (image: AdminImage, preview?: string): Item => ({ ...image, key: `image-${++nextKey}`, preview });
const plain = ({ role, alt, base, widths, aspect }: Item): AdminImage => ({ role, alt, base, widths, aspect });
const same = (a: Item[], b: Item[]) => JSON.stringify(a.map(plain)) === JSON.stringify(b.map(plain));

function uploadFailure(cause: unknown) {
  if (cause instanceof ImageRejected) return { error: cause.message, retry: false };
  if (cause instanceof AdminApiError) return { error: cause.body.message, retry: true };
  if (cause instanceof Error && cause.message.startsWith("Storage answered"))
    return { error: "The image store refused this upload. Try again.", retry: true };
  return { error: "The upload didn't finish. Check your connection and try again.", retry: true };
}

// State lives with the editor, whose single unsaved-changes guard has to know about it.
export function useImageManager(product: AdminProduct, onSaved: () => void) {
  const api = useAdminApi();
  const [items, setItems] = useState<Item[]>(() => (product.images ?? []).map((image) => withKey(image)));
  const [saved, setSaved] = useState(items);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const queue = useRef(Promise.resolve());
  const leaving = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    leaving.current = controller;
    return () => controller.abort();
  }, []);
  const uploading = rows.some((row) => row.status === "working");

  async function upload(id: string, file: File) {
    const change = (patch: Partial<Row>) => setRows((all) => all.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    const signal = leaving.current?.signal ?? new AbortController().signal;
    try {
      change({ status: "working", step: "Preparing", done: 0, total: 0, error: undefined });
      const prepared = await prepareImage(file);
      change({ step: "Uploading", total: prepared.files.length, preview: prepared.preview });
      const grant = await api<UploadGrant>("/uploads", {
        method: "POST",
        body: { product_slug: product.slug, widths: prepared.widths, content_type: WEBP },
      });
      let done = 0;
      // One size at a time, so a phone on a slow connection isn't asked for three at once.
      for (const target of grant.uploads) {
        const size = prepared.files.find((item) => item.width === target.width);
        if (!size) throw new Error("The upload plan didn't match the image.");
        await putImage(target, size.blob, signal);
        change({ done: ++done });
      }
      setItems((all) => [
        ...all,
        withKey(
          { role: all.some((item) => item.role === "hero") ? "gallery" : "hero", alt: "", base: grant.base, widths: prepared.widths, aspect: prepared.aspect },
          prepared.preview
        ),
      ]);
      setRows((all) => all.filter((row) => row.id !== id));
    } catch (cause) {
      if (signal.aborted) return;
      change({ status: "failed", ...uploadFailure(cause) });
    }
  }
  function enqueue(id: string, file: File) {
    queue.current = queue.current.then(() => upload(id, file));
  }
  return {
    product,
    items,
    rows,
    saving,
    message,
    failure,
    errors,
    uploading,
    // An upload in progress or a list that differs from what's saved would be lost by leaving.
    dirty: uploading || !same(items, saved),
    add(files: File[]) {
      setMessage("");
      setFailure("");
      const added = files.map((file): Row => ({ id: `upload-${++nextKey}`, file, status: "working", step: "Waiting", done: 0, total: 0 }));
      setRows((all) => [...all, ...added]);
      added.forEach((row) => enqueue(row.id, row.file));
    },
    retry(row: Row) {
      setRows((all) => all.map((item) => (item.id === row.id ? { ...item, status: "working", step: "Waiting", error: undefined } : item)));
      enqueue(row.id, row.file);
    },
    dismiss(id: string) {
      setRows((all) => all.filter((row) => row.id !== id));
    },
    change(key: string, patch: Partial<AdminImage>) {
      setMessage("");
      setItems((all) => all.map((item) => (item.key === key ? { ...item, ...patch } : item)));
      setErrors((all) => Object.fromEntries(Object.entries(all).filter(([field]) => field !== key)));
    },
    move(key: string, offset: -1 | 1) {
      setMessage("");
      setItems((all) => {
        const from = all.findIndex((item) => item.key === key);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= all.length) return all;
        const next = [...all];
        [next[from], next[to]] = [next[to], next[from]];
        return next;
      });
    },
    remove(key: string) {
      setMessage("");
      setItems((all) => all.filter((item) => item.key !== key));
    },
    async save() {
      const invalid: Record<string, string> = {};
      for (const item of items) if (!item.alt.trim()) invalid[item.key] = "Describe this image for people who can't see it.";
      setErrors(invalid);
      setMessage("");
      setFailure("");
      const first = items.find((item) => invalid[item.key]);
      if (first) {
        document.getElementById(`alt-${first.key}`)?.querySelector("input")?.focus();
        return;
      }
      setSaving(true);
      try {
        const trimmed = items.map((item) => ({ ...item, alt: item.alt.trim() }));
        await api(`/products/${product.slug}`, { method: "PATCH", body: { images: trimmed.map(plain) } });
        // Anything changed while this was saving stays in the list, and stays unsaved.
        const sent = new Map(items.map((item) => [item.key, item.alt]));
        setItems((current) => current.map((item) => (sent.get(item.key) === item.alt ? { ...item, alt: item.alt.trim() } : item)));
        setSaved(trimmed);
        setMessage("Images saved.");
        onSaved();
      } catch (cause) {
        setFailure(issue(cause));
      } finally {
        setSaving(false);
      }
    },
  };
}

export function ImageManager({ manager }: { manager: ReturnType<typeof useImageManager> }) {
  const picker = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const { items, rows, product } = manager;
  function move(key: string, position: number, offset: -1 | 1) {
    manager.move(key, offset);
    setAnnouncement(`Image moved to position ${position + offset + 1} of ${items.length}.`);
    // Keep the keyboard on the image that moved, even when it reaches an end of the list.
    window.requestAnimationFrame(() => {
      const direction = offset < 0 ? "up" : "down";
      const button = document.getElementById(`move-${direction}-${key}`) as HTMLButtonElement | null;
      (button && !button.disabled ? button : document.getElementById(`move-${offset < 0 ? "down" : "up"}-${key}`))?.focus();
    });
  }
  return (
    <div className="admin-image-manager">
      <p className="admin-help">
        The first image is the one customers see first. Add several at once; each one needs a short description.
      </p>
      {!items.length && !rows.length && (
        <p className="admin-image-empty">
          {product.status === "active"
            ? "No images yet, so customers can't see this product. Add one to put it on the site."
            : "No images yet. Add one before you make this product active."}
        </p>
      )}
      <p className="sr-only" role="status">{announcement}</p>
      {items.length > 0 && (
        <ol className="admin-image-list">
          {items.map((item, index) => (
            <li className="admin-image-row" key={item.key}>
              <div className="admin-image-preview">
                <img src={item.preview ?? `${item.base}-${item.widths[0]}.webp`} alt="" width={96} height={96} />
                <span>{index + 1}</span>
              </div>
              <div className="admin-image-fields" id={`alt-${item.key}`}>
                <Field
                  label={`Description of image ${index + 1}`}
                  name={`alt-input-${item.key}`}
                  value={item.alt}
                  onChange={(alt) => manager.change(item.key, { alt })}
                  error={manager.errors[item.key]}
                  required
                />
                <label className="admin-field">
                  <span>Type of image {index + 1}</span>
                  <select value={item.role} onChange={(event) => manager.change(item.key, { role: event.target.value })}>
                    {roles.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="admin-image-actions">
                <button
                  type="button"
                  id={`move-up-${item.key}`}
                  aria-label={`Move image ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => move(item.key, index, -1)}
                >
                  <ArrowUp size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  id={`move-down-${item.key}`}
                  aria-label={`Move image ${index + 1} down`}
                  disabled={index === items.length - 1}
                  onClick={() => move(item.key, index, 1)}
                >
                  <ArrowDown size={18} aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => manager.remove(item.key)}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {rows.length > 0 && (
        <ul className="admin-upload-list" aria-live="polite">
          {rows.map((row) => (
            <li key={row.id} className={row.status}>
              <strong>{row.file.name}</strong>
              {row.status === "working" ? (
                <>
                  <span>
                    {row.step === "Uploading" ? `Uploading size ${Math.min(row.done + 1, row.total)} of ${row.total}` : `${row.step}…`}
                  </span>
                  <progress
                    aria-label={`Progress for ${row.file.name}`}
                    max={Math.max(row.total, 1)}
                    value={row.total ? row.done : undefined}
                  />
                </>
              ) : (
                <>
                  <span role="alert">{row.error}</span>
                  <div className="admin-upload-actions">
                    {row.retry && (
                      <button type="button" className="admin-button secondary" onClick={() => manager.retry(row)}>Try again</button>
                    )}
                    <button type="button" className="admin-button secondary" onClick={() => manager.dismiss(row.id)}>Dismiss</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <input
        ref={picker}
        hidden
        type="file"
        accept="image/*"
        multiple
        aria-label="Choose images"
        onChange={(event) => {
          manager.add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Notice text={manager.message} />
      <Notice text={manager.failure} kind="error" />
      <div className="admin-image-buttons">
        <button type="button" className="admin-button secondary" onClick={() => picker.current?.click()}>
          <Upload size={16} aria-hidden="true" /> Add images
        </button>
        <button
          type="button"
          className="admin-button"
          disabled={manager.saving || manager.uploading || !manager.dirty}
          onClick={() => void manager.save()}
        >
          {manager.saving ? "Saving…" : manager.uploading ? "Uploading…" : "Save images"}
        </button>
      </div>
    </div>
  );
}
