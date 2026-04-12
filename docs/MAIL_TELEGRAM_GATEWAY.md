# Mail Gateway Telegram — OCA Module Analysis

**Repository:** [OCA/social](https://github.com/OCA/social) branch `16.0`
**Fork:** [bringout/odoo-bringout-oca-social](https://github.com/bringout/odoo-bringout-oca-social)
**License:** AGPL-3
**Authors:** Creu Blanca, Dixmit
**Status:** Beta

## Module Dependency Tree

```
mail_gateway_telegram (16.0.1.1.0)
└── mail_gateway (16.0.1.3.3)        ← OCA base gateway framework
    └── mail                           ← Odoo standard (built-in)
```

Only **two OCA modules** are required: `mail_gateway` and `mail_gateway_telegram`.

## External Python Dependencies

| Package | nixpkgs attribute | Purpose |
|---------|-------------------|---------|
| `python-telegram-bot` | `python-telegram-bot` | Telegram Bot API client |
| `lottie` | `lottie` | Animated sticker support |
| `cairosvg` | `cairosvg` | SVG → raster conversion (stickers) |

All three are available in nixpkgs and must be added to `propagatedBuildInputs`
in `infra-24/pkgs/odoo/odoo-bosnian/default.nix`.

## Architecture

### `mail_gateway` — Base Framework Module

The abstraction layer that all messaging integrations (Telegram, WhatsApp) build on:

- **MailGateway model** (`mail.gateway`) — stores gateway config: token, webhook key/secret, state (pending/integrated)
- **MailGatewayAbstract** (`mail.gateway.abstract`) — abstract base class with hooks:
  - `_receive_update()` — process incoming message from external service
  - `_send()` — send message from Odoo to external service
  - `_get_channel()` — create or retrieve `mail.channel` from external chat
  - `_get_author()` — map external user to Odoo partner/guest
- **Webhook controller** — HTTP endpoint that routes incoming webhook POSTs to the correct gateway
- **Security** — webhook user isolation, member authorization, webhook secret verification

### `mail_gateway_telegram` — Telegram Implementation

Implements the `mail.gateway.abstract` interface for Telegram Bot API.

**Key classes:**
- `MailGatewayTelegramService` (extends `mail.gateway.abstract`) — all Telegram-specific logic
- `MailGateway` extension — adds `telegram_security_key` field
- `MailChannel` extension — avatar generation with Telegram icon

## Features

### Bidirectional Messaging
- Receive Telegram messages in Odoo discuss/channels
- Reply from Odoo back to Telegram
- Message threading and reply handling

### Rich Media Support
- Text messages
- Images and documents
- Contact information exchange
- Animated stickers — auto-converted to GIF via `lottie` + `cairosvg`
- Attachment processing via `_process_telegram_attachment()`

### Channel Management
- Auto-creates Odoo `mail.channel` per Telegram chat
- `_get_channel()` creates or retrieves channels from Telegram updates
- `_get_channel_vals()` extracts channel metadata

### User/Partner Mapping
- `_get_author()` and `_get_author_vals()` map Telegram users → Odoo partners or guests
- Supports both identified partners and anonymous guest users

### Team Support
- Multiple Odoo users can respond to the same customer conversation
- Group-based partner response functionality

### Security
- Token-based gateway identification
- Webhook secret verification (`_verify_update()`)
- Optional `telegram_security_key` requiring `/start` command with key
- Webhook user context isolation
- `no-gateway-notification` flag to prevent notification loops

### Bot Commands
- `_preprocess_update()` handles `/start` and other commands
- Command-based channel initialization with optional security key validation

### Frontend (Odoo UI)
- JS extensions for message display in Odoo discuss (`static/src/models/`)
- Notification handling
- Gateway configuration form with Telegram-specific section
- Smart button to register/remove webhook

## Configuration Workflow

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) → get API token
2. In Odoo: Settings → Mail Gateway → Create new gateway (type: Telegram)
3. Enter the bot token
4. Define webhook key and webhook secret
5. Click "Set Webhook" smart button to register with Telegram API
6. (Optional) Enable and set `telegram_security_key` for additional authentication
7. Users start conversations with the bot → Odoo auto-creates channels

## Deployment (bringout infra-24)

### Nix Python Dependencies

Added to `infra-24/pkgs/odoo/odoo-bosnian/default.nix` in `propagatedBuildInputs`:
```nix
python-telegram-bot
cairosvg
lottie
```

### OCA Addon Package

Modules `mail_gateway` and `mail_gateway_telegram` are merged into the existing
`odoo_16_OCA` zip archive via:
```bash
python scripts/upgrade_production_nix_service.py \
  --modules mail_gateway,mail_gateway_telegram \
  --nix-package OCA --oca-repo oca-social --install
```

### Service Configuration

The OCA addon package is already in the addons list at
`infra-24/services/bringout/officesa/odoo-bringout-1/default.nix`:
```nix
addons = [
    pkgs.odoo-16-oca    # ← mail_gateway, mail_gateway_telegram included here
    ...
];
```

## Related Modules (same repo)

- `mail_gateway_whatsapp` — WhatsApp Business API implementation of `mail.gateway.abstract`
- Both share the same `mail_gateway` base and can coexist

## Upstream Sync

```bash
cd packages/oca-social
git fetch upstream 16.0
git merge upstream/16.0
git push origin 16.0
```
