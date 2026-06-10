import {_t} from "@web/core/l10n/translation";
import {threadActionsRegistry} from "@mail/core/common/thread_actions";

// V19: action `condition` runs inside the reactive render of the thread
// view. The old implementation fired async ORM calls from condition() and
// mutated the reactive thread record (_guestChecked/_cachedGuestId/...),
// which silently broke the reactivity of the whole thread pane — messages
// were fetched into the store but never rendered. Conditions must be PURE:
// gate on channel_type === "gateway" and do the ORM lookups lazily in open().

threadActionsRegistry
    .add("open-gw-new-partner", {
        condition: ({owner, thread}) =>
            thread?.model === "discuss.channel" &&
            thread.channel_type === "gateway" &&
            (!owner.props.chatWindow || owner.props.chatWindow.isOpen),
        icon: "fa fa-fw fa-address-book",
        name: _t("New Partner"),
        async open({owner, thread}) {
            const orm = owner.env.services.orm;
            const members = await orm.silent.searchRead(
                "discuss.channel.member",
                [["channel_id", "=", thread.id]],
                ["guest_id"]
            );
            const guestMembers = members.filter((m) => m.guest_id);
            if (guestMembers.length !== 1) {
                owner.env.services.notification.add(
                    _t("This channel has no single guest to assign."),
                    {type: "info"}
                );
                return;
            }
            await owner.env.services.action.doAction({
                type: "ir.actions.act_window",
                res_model: "mail.guest.manage",
                context: {default_guest_id: guestMembers[0].guest_id[0]},
                views: [[false, "form"]],
                target: "new",
            });
        },
        iconLarge: "fa fa-fw fa-lg fa-address-book",
        sequence: 18,
    })
    .add("open-gw-profile", {
        condition: ({owner, thread}) =>
            thread?.model === "discuss.channel" &&
            thread.channel_type === "gateway" &&
            (!owner.props.chatWindow || owner.props.chatWindow.isOpen),
        icon: "fa fa-fw fa-user-circle-o",
        name: _t("Open Contact"),
        async open({owner, thread}) {
            const orm = owner.env.services.orm;
            let partnerId = null;
            const channelData = await orm.silent.searchRead(
                "discuss.channel",
                [["id", "=", thread.id]],
                ["gateway_channel_token"]
            );
            if (channelData[0]?.gateway_channel_token) {
                const gatewayChannel = await orm.silent.searchRead(
                    "res.partner.gateway.channel",
                    [["gateway_token", "=", channelData[0].gateway_channel_token]],
                    ["partner_id"]
                );
                partnerId = Array.isArray(gatewayChannel[0]?.partner_id)
                    ? gatewayChannel[0].partner_id[0]
                    : gatewayChannel[0]?.partner_id;
            } else {
                partnerId = thread.correspondent?.partner_id?.id;
            }
            if (!partnerId) {
                owner.env.services.notification.add(
                    _t("No contact is linked to this channel."),
                    {type: "info"}
                );
                return;
            }
            await owner.env.services.action.doAction({
                type: "ir.actions.act_window",
                res_model: "res.partner",
                res_id: partnerId,
                views: [[false, "form"]],
            });
        },
        iconLarge: "fa fa-fw fa-lg fa-user-circle-o",
        sequence: 17,
    });
