# Copyright 2024 Dixmit
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl).

from odoo import fields, models


class ResPartner(models.Model):
    """Update of res.partner class to take into account the gateway."""

    _inherit = "res.partner"

    gateway_channel_ids = fields.One2many(
        "res.partner.gateway.channel", inverse_name="partner_id"
    )

    def mail_partner_format(self, fields=None):
        """Override to add gateway info."""
        partners_format = super().mail_partner_format(fields=fields)
        if not fields:
            fields = {"gateway_channel_ids": True}
        for partner in self:
            if "gateway_channel_ids" in fields:
                partners_format.get(partner).update(
                    {
                        "gateway_channels": partner.gateway_channel_ids.mail_format(),
                    }
                )
        return partners_format

    def _get_channels_as_member(self):
        channels = super()._get_channels_as_member()
        if self.env.user.has_group("mail_gateway.gateway_user"):
            channels |= self.env["mail.channel"].search(
                [
                    ("channel_type", "=", "gateway"),
                    (
                        "channel_member_ids",
                        "in",
                        self.env["mail.channel.member"]
                        .sudo()
                        ._search(
                            [
                                ("partner_id", "=", self.id),
                                ("is_pinned", "=", True),
                            ]
                        ),
                    ),
                ]
            )
        return channels


class ResPartnerGatewayChannel(models.Model):
    _name = "res.partner.gateway.channel"
    _description = "Technical data used to get the gateway author"

    name = fields.Char(related="gateway_id.name")
    partner_id = fields.Many2one(
        "res.partner", required=True, ondelete="cascade"
    )
    gateway_id = fields.Many2one(
        "mail.gateway", required=True, readonly=True, ondelete="cascade"
    )
    gateway_token = fields.Char(readonly=True)
    company_id = fields.Many2one(
        "res.company", related="gateway_id.company_id", store=True
    )

    def name_get(self):
        # Be able to tell to which partner belongs the gateway partner channel
        # e.g.: picking it from a selector
        result = []
        origin = super().name_get()
        if not self.env.context.get("mail_gateway_partner_info", False):
            return origin
        origin_dict = dict(origin)
        for record in self:
            result.append(
                (
                    record.id,
                    "{} ({})".format(
                        record.partner_id.display_name, origin_dict[record.id]
                    ),
                )
            )
        return result

    _sql_constraints = [
        (
            "unique_partner_gateway",
            "UNIQUE(partner_id, gateway_id)",
            "Partner can only have one configuration for each gateway.",
        ),
    ]

    def write(self, vals):
        old_partner_map = {}
        if "partner_id" in vals:
            for rec in self:
                old_partner_map[rec.id] = rec.partner_id.id
        res = super().write(vals)
        if "partner_id" in vals:
            new_partner_id = vals["partner_id"]
            for rec in self:
                old_pid = old_partner_map.get(rec.id)
                if old_pid and old_pid != new_partner_id:
                    rec._update_channel_partner(old_pid, new_partner_id)
        return res

    def _update_channel_partner(self, old_partner_id, new_partner_id):
        """Update mail.channel member and name when partner mapping changes."""
        channels = self.env["mail.channel"].sudo().search([
            ("gateway_id", "=", self.gateway_id.id),
            ("gateway_channel_token", "=", self.gateway_token),
        ])
        new_partner = self.env["res.partner"].browse(new_partner_id)
        for channel in channels:
            member = self.env["mail.channel.member"].sudo().search([
                ("channel_id", "=", channel.id),
                ("partner_id", "=", old_partner_id),
            ], limit=1)
            if member:
                self.env.cr.execute(
                    "UPDATE mail_channel_member SET partner_id = %s WHERE id = %s",
                    (new_partner_id, member.id),
                )
            channel.sudo().write({
                "name": new_partner.display_name,
                "anonymous_name": new_partner.display_name,
            })

    def mail_format(self):
        return [r._mail_format() for r in self]

    def _mail_format(self):
        return {
            "id": self.id,
            "name": self.name,
            "gateway": {
                "id": self.gateway_id.id,
                "name": self.gateway_id.name,
                "type": self.gateway_id.gateway_type,
            },
        }
