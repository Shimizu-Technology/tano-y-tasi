import { Modal } from "./Modal";
import { Signup } from "./Shared";

/**
 * The alert signup, opened in place by a `NOTIFY ME` action so the page doesn't move.
 * `name` is what the alert is for; without one it is the general list.
 */
export function NotifyDialog({ name, source, dropSlug, onClose }: { name?: string; source: string; dropSlug?: string; onClose: () => void }) {
  return (
    <Modal label="Get notified" className="notify-dialog" onClose={onClose}>
      {(close) => <>
        <div className="notify-header">
          <p className="label muted">GET NOTIFIED</p>
          <button className="text-button" onClick={close}>CLOSE</button>
        </div>
        <h2>{name ?? "New drops, first."}</h2>
        <p className="muted">{name ? "One email when it’s ready. No spam." : "No spam. Just a piece of home."}</p>
        <Signup inline autoFocus source={source} dropSlug={dropSlug} cta="NOTIFY ME" />
      </>}
    </Modal>
  );
}
