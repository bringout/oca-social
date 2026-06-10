# Copyright 2024 Dixmit
# License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl).

from odoo import fields, models


class ResUsers(models.Model):
    _inherit = "res.users"

    gateway_ids = fields.Many2many("mail.gateway")

    def _init_messaging(self, store):
        # v19: Store.add() only accepts recordsets; plain dicts of global
        # values go through add_global_values().
        super()._init_messaging(store)
        store.add_global_values(gateways=self.gateway_ids.gateway_info())
