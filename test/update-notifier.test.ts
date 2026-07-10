import { describe, expect, it, vi } from "vitest";
import { type NotificationSpec, UpdateNotifier } from "../src/update-notifier.js";
import type { UpdateState, UpdateStatus } from "../src/types.js";

const stateOf = (status: UpdateStatus, version: string | null = null): UpdateState => ({
  status,
  version,
  percent: null,
  error: null,
});

// Inject a fake presenter so the notifier's logic is exercised without macOS —
// the deferred electron require in update-notifier.ts is never reached.
function makeNotifier() {
  const shown: NotificationSpec[] = [];
  const onDownload = vi.fn();
  const notifier = new UpdateNotifier(onDownload, { present: (spec) => shown.push(spec) });
  return { notifier, shown, onDownload };
}

describe("UpdateNotifier", () => {
  it("notifies once when entering 'available', with a click that starts the download", () => {
    const { notifier, shown, onDownload } = makeNotifier();
    notifier.handle(stateOf("checking"));
    notifier.handle(stateOf("available", "1.2.3"));

    expect(shown).toHaveLength(1);
    expect(shown[0].title).toContain("available");
    expect(shown[0].body).toContain("1.2.3");
    expect(shown[0].onClick).toBeTypeOf("function");
    shown[0].onClick?.();
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it("does not re-notify on a repeated same-status push", () => {
    const { notifier, shown } = makeNotifier();
    notifier.handle(stateOf("available", "1.2.3"));
    notifier.handle(stateOf("available", "1.2.3"));
    expect(shown).toHaveLength(1);
  });

  it("makes the 'downloaded' notification passive — no click action", () => {
    const { notifier, shown } = makeNotifier();
    notifier.handle(stateOf("downloaded", "1.2.3"));
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toContain("ready to install");
    expect(shown[0].onClick).toBeUndefined();
  });

  it("stays silent for states with no pending user action", () => {
    const { notifier, shown } = makeNotifier();
    for (const status of ["idle", "checking", "downloading", "error"] satisfies UpdateStatus[]) {
      notifier.handle(stateOf(status));
    }
    expect(shown).toHaveLength(0);
  });

  it("announces an install with the new version and no click action", () => {
    const { notifier, shown } = makeNotifier();
    notifier.announceInstalled("2.0.0");
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toContain("updated");
    expect(shown[0].body).toContain("2.0.0");
    expect(shown[0].onClick).toBeUndefined();
  });
});
