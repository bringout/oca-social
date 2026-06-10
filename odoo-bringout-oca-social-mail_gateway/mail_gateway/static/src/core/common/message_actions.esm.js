import {_t} from "@web/core/l10n/translation";
import {messageActionsRegistry} from "@mail/core/common/message_actions";

// V19: message actions are also evaluated in contexts without a thread
// (e.g. MessageReactions) — `thread` may be undefined, guard every access.
messageActionsRegistry
    .add("link_gateway_to_thread", {
        condition: ({message, thread}) =>
            message.gateway_type && thread?.model === "discuss.channel",
        icon: "fa fa-link",
        name: _t("Link to thread"),
        onSelected: ({owner}) => owner.onClickLinkGatewayToThread(),
        sequence: 20,
    })
    .add("send_with_gateway", {
        condition: ({message, thread}) =>
            !message.gateway_type && thread && thread.model !== "discuss.channel",
        icon: "fa fa-share-square-o",
        name: _t("Send with gateway"),
        onSelected: ({owner}) => owner.onClickSendWithGateway(),
        sequence: 20,
    });
