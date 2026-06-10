# mail_gateway — Odoo 19.0 port notes

> Status 2026-06-10: second-pass fix of the 18→19 port (branch `19.0` of this
> oca-social fork). The first pass (commit `5c2c2eb2`) install-verified but
> **broke the web client at request time** — the bringout v16→v19 migration
> (`docs/BRINGOUT_V16_V19_NOTES.md` in profile/hetzner) had to uninstall the
> telegram cluster because of it. This pass fixes the runtime layer.
> Verification on the hodi-2 harness is still PENDING (harness was occupied by
> another session at the time of writing — see "Remaining work").

## Symptom

With `mail_gateway` installed on v19, module load / `--init` passes, but any
web-client request that serializes a partner through the discuss `Store`
(i.e. practically every Discuss/chatter RPC) throws and breaks the client:

```
AttributeError: 'super' object has no attribute '_to_store'   (res.partner)
TypeError: _to_store() takes ... positional arguments ...     (mail.message)
```

Root cause: the first-pass port kept the **Odoo 18 Store API shapes**. v19
redesigned the Store framework (`odoo/addons/mail/tools/discuss.py`):

| 18.0 | 19.0 |
|---|---|
| `_to_store(self, store, /, *, fields=None, ...)` on many models | `_to_store(self, store, fields, ...)` — `fields` **positional**; only models that define it in core have it (`mail.message`, `discuss.channel`, ...) |
| `res.partner._to_store`, `mail.guest._to_store`, `mail.notification._to_store` exist | **Removed** — these models serialize via `_to_store_defaults(target)` (list of field specs / `Store.Attr` / `Store.One/Many`) |
| `store.add(record, {dict})` adds raw values | dict is converted to `Store.Attr` fields and **re-dispatches `_to_store`** → calling `store.add()` from inside `_to_store` recurses infinitely; use `store.add_records_fields()` |
| `store.add({plain dict})` = global values | `Store.add()` asserts a recordset; use `store.add_global_values(**values)` |
| `record._bus_send_store(records, values)` | **Removed** — `Store(bus_channel=record._bus_channel()).add(...).bus_send()` |
| `_thread_to_store(self, store, /, *, fields=None, request_list=None)` | `_thread_to_store(self, store, fields, *, request_list=None)` |
| `mail.message._to_store(..., for_current_user=...)` | `for_current_user` removed; `msg_vals=False` |
| `message_get_followers()` result: `f["partner"]["..."]` nested dicts | store result format: relations are id references; partner data sits under `res.partner` key |

## Python fixes (models/, wizards/)

* **`models/res_partner.py`** — the reported crash. Replaced the `_to_store`
  override (no super in v19 + it hijacked default serialization) with a
  `_to_store_defaults` extension:
  `Store.Attr("gateway_channels", lambda p: p.sudo().gateway_channel_ids.mail_format())`.
  This is the v19 equivalent of the old `Store.one_id` monkey-patch
  (`tools/discuss.py`, now a stub). Also removed the
  `_get_channels_as_member` override — dead since v18 (core moved it to
  `discuss.channel`; its pinned-member domain `channel_type not in
  (channel, group)` already includes gateway channels).
* **`models/mail_notification.py`** — `_to_store` → `_to_store_defaults` +
  `["gateway_type", Store.Attr("channel_name", ...)]`. The flat
  `channel_name` is what the JS popover template consumes
  (`notification.channel_name`).
* **`models/mail_guest.py`** — `_to_store` → `_to_store_defaults` +
  `Store.Attr("gateway", lambda g: {"id": g.gateway_id.id})`.
* **`models/mail_message.py`** — fixed `_to_store` to the v19 signature
  (`fields` positional, no `for_current_user`); extra fields go through
  `store.add_records_fields(self, ["gateway_type", "gateway_channel_data",
  "gateway_thread_data"])` (plain field names — all three are real fields).
* **`models/discuss_channel.py`** — fixed `_to_store(store, fields)`
  signature; gateway payload via `add_records_fields` + `Store.Attr` lambdas.
* **`models/mail_thread.py`** —
  * `_thread_to_store` v19 signature; `gateway_followers` computed from the
    ORM (`mail.followers` search → partners with `gateway_channel_ids`) and
    sent as `Store.Many(partners)` so the client-side relation
    (`fields.Many("res.partner")`) populates automatically. Guarded with
    `if request_list is None: return` — only direct chatter thread-data
    requests need it, and the guard prevents double work on nested
    `store.add(..., as_thread=True)` calls.
  * `_bus_send_store` call → `Store(bus_channel=msg._bus_channel()).add(...)
    .bus_send()`.
* **`models/res_users.py`** — `_init_messaging`: `store.add({dict})` →
  `store.add_global_values(gateways=...)`.
* **`wizards/mail_message_gateway_link.py`** — same `_bus_send_store`
  replacement.

## JS / asset fixes (static/src/)

The 18-era JS broke the **whole web-client asset bundle** (imports of modules
that no longer exist) — this alone bricks the client for all users once the
module is installed, independent of the Python errors.

Adopted the JS tree from the (closed, unmerged) upstream migration PR
[OCA/social#1871](https://github.com/OCA/social/pull/1871)
(`komit-consulting:19.0-mig-mail_gateway`), which already converted to v19
APIs, then fixed what the PR missed:

| 18.0 | 19.0 |
|---|---|
| `@mail/core/common/persona_model` / `Persona` | `@mail/core/common/res_partner_model` / `ResPartner`; relation model name `"Persona"` → `"res.partner"` |
| `@mail/core/public_web/discuss_app_category_model` | `@mail/discuss/core/public_web/discuss_app_category_model` |
| `Record.one()/.many()/.attr()` | `fields.One()/Many()/Attr()` from `@mail/core/common/record` |
| `thread.lastInterestDateTime` | `thread.lastInterestDt` *(PR missed this — fixed in `discuss_app_category_model_patch.esm.js`)* |
| message/thread action registries: `condition(component)`, `onClick`, `title` | `condition({message, thread, owner, store})`, `onSelected({owner, ...})`, `name` |
| `@mail/chatter/web/mail_composer_send_dropdown` widget | **Removed in v19** → module files deleted (esm.js + xml) |
| `Store.fetchData` patch to copy `gateway_followers` | unnecessary — server sends it as a Store relation in the `mail.thread` payload; declared `fields.Many("res.partner")` populates automatically (patch removed) |
| composer full-composer flow: `textInputContent`, `messageService.getMentionsFromText`, `recipient.persona`, `mail_post_autofollow`, onClose `args.length===0` | `composer.composerHtml` (+ `formatDefaultBodyForFullComposer`), recipients carry `partner_id` directly, autofollow dropped in 18.2+, onClose gets `{dismiss}/{special}` *(rewritten in `components/composer/composer.esm.js`)* |
| `ChannelMemberList` `this.avatarCard` | gone; core `canOpenChatWith` already excludes guests → patch file deleted |
| custom `gateway_core_web_service` syncing category open state | redundant — core `mail_core_common_service` updates `store.settings` from the `res.users.settings` bus and `DiscussAppCategory.open` reads `store.settings[serverStateKey]` → file deleted |

XML template inherits audited against v19 (`mail.Message`,
`mail.DiscussSidebarChannel.main`, `mail.Chatter` anchors all still valid).
One stale anchor fixed: `mail.MessageNotificationPopover` no longer has
`//span[@t-if='notification.persona']` — re-anchored to
`//span[@t-elif='notification.mail_email_address']` (extends the
t-if/t-elif chain; gateway notifications have neither partner nor email).

`chatter.esm.js`: `toggleComposer` now passes `...arguments` through (v19
signature gained an `{force}` option) and guards `state.thread?.composer`.

Manifest version bumped `19.0.1.0.9` → `19.0.1.1.0`.

## mail_gateway_telegram

No changes needed for this pass. Its `static/src/models/*.js` use the
**16.0-era** `registerPatch`/`mail.assets_messaging` framework — that bundle
does not exist in v18/v19, so the files are never loaded (dead code upstream
in OCA 18.0 too). Generic gateway icons from mail_gateway
(`fa fa-${gateway_type}` → `fa-telegram`) cover the UI. Python deps
(python-telegram-bot, lottie, cairosvg) are already in the infra-hodi
`odoo19` env (see BRINGOUT_V16_V19_NOTES.md).

## Known divergences from upstream PR #1871

Where this fork deliberately differs from the PR:

* PR **commented out** `mail.message._to_store` and `discuss.channel
  _to_store` (losing gateway data on messages/channels) — this fork fixes the
  signatures instead.
* PR still uses the removed `_bus_send_store` (would crash on message
  link/unlink) — fixed here.
* PR's notification `_to_store_defaults` sends a `gateway_channel_id`
  relation, but its own popover template reads `notification.channel_name` —
  this fork sends the flat `channel_name` that the template expects.
* PR sends `gateway_followers` as plain dicts; this fork sends a
  `Store.Many` relation (idiomatic v19, auto-populates the JS field).

## Remaining work / verification plan

The hodi-2 port harness (`/root/port_test_final.sh`, scratch DB
`v19_port_test`, conf `/var/lib/odoo19-port/odoo.conf`, port 8141) was in use
by another session, so this pass is **not yet install/runtime-verified**:

1. Re-stage the fixed module:
   `rsync -a --delete packages/oca-social/odoo-bringout-oca-social-mail_gateway/mail_gateway/ hodi-2:/var/lib/odoo19-port/addons/mail_gateway/`
   (stale stages have bitten before — always re-sync from the 19.0 branch).
2. `ssh hodi-2 /root/port_test_final.sh mail_gateway,mail_gateway_telegram` —
   must end `EXIT=0`.
3. Runtime smoke test of the previously-throwing paths (odoo shell on the
   scratch DB is enough, no browser needed):
   ```python
   from odoo.addons.mail.tools.discuss import Store
   Store().add(env.user.partner_id).get_result()          # partner defaults
   Store().add(env["mail.message"].search([], limit=5)).get_result()
   env["res.partner"].search([], limit=1)._thread_to_store  # signature only
   ```
4. Web-client check: log into the harness instance (or the migration
   instance once re-installed) and open Discuss + a chatter — watch for RPC
   errors and JS console errors (asset bundle must compile).
5. Re-install the telegram cluster on `bringout_migration_v19`
   (`mail_gateway, mail_gateway_telegram, telegram_partner_group,
   telegram_iddeea_pdf_processor`) and re-run the migration's web-client
   verification.
