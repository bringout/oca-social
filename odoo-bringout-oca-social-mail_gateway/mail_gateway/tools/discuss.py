# Copyright 2025 Tecnativa - Carlos Roca
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl).

# v19: Store.one_id was removed (the Store API was redesigned around per-model
# _to_store/Store.add). The old extended_one_id monkey-patch that added
# `gateway_channels` to res.partner serialization is reimplemented as a proper
# res.partner._to_store override in models/res_partner.py. Nothing to patch here.
