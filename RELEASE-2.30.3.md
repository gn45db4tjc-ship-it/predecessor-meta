# 2.30.3 — home-screen app update delivery

An installed phone app could resume its old, already-running interface indefinitely while refreshing statistics. The data refresh did not replace its JavaScript, and there was no interface-update prompt.

The published manifest now identifies the app release independently of statistical data. Returning to the app checks that lightweight status (at most once per five minutes); existing publication checks also detect new releases. A visible **Update app** action appears when a newer interface is available. **More → App updates** and Sources show the running version and provide a manual check.

Applying an update first verifies that a fresh document has the expected release, saves the active choices, verifies the saved draft, inventory and preferences, then reopens the same route. An offline response, captive portal, mismatched release or failed save leaves the existing screen usable. The updater does not clear data or browser storage, and does not force a reload during a draft. An older publication is reported with its actual version rather than called the latest release.

The service worker bypasses HTTP caching when checking its own script. Its existing network-first navigation and permanent verified-data cache remain in place.

## First update from an older phone app

Versions before 2.30.3 have no update button. Fully close the installed app from the phone's app switcher, then reopen its home-screen icon while connected. **More → App updates → Running v2.30.3** confirms that this fix loaded. Merely returning to the home screen can leave the old app suspended. Do not remove the app or clear its website data: neither is required, and either can discard saved choices.

Browser emulation verifies the upgrade, real network-outage behavior and storage preservation. Physical iPhone/Android acceptance still requires checking the installed app on that device.

## Scope and rollback

No observations, source dates, recommendation formulas, reviewed guidance or collection schedules changed. This release repairs delivery of app-interface updates. Source packaging and publication receipts are recorded separately. Public rollback is a revert of this release followed by the established publication workflow; local source backup and rollback instructions are recorded with installation.
