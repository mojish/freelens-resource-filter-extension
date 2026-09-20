/**
 * Main entry: load durable UI prefs store so it flushes under the Freelens profile.
 */

import { Main } from "@freelensapp/extensions";
import { UiPrefsStore } from "../common/ui-prefs-store";

export default class ResourceFilterMain extends Main.LensExtension {
  async onActivate() {
    (UiPrefsStore.getInstanceOrCreate() as UiPrefsStore).loadExtension(this);
  }
}
