import {Composer} from "@mail/core/common/composer";
import {_t} from "@web/core/l10n/translation";
import {patch} from "@web/core/utils/patch";

patch(Composer.prototype, {
    get SEND_TEXT() {
        if (this.props.type === "gateway" && !this.props.composer.message) {
            return _t("Send gateway");
        }
        return super.SEND_TEXT;
    },
    get placeholder() {
        if (
            this.thread?.model !== "discuss.channel" &&
            !this.props.placeholder &&
            this.props.type === "gateway"
        ) {
            return _t("Send a message to a gateway...");
        }
        return super.placeholder;
    },
    get isSendButtonDisabled() {
        const isSendButtonDisabled = super.isSendButtonDisabled;
        if (this.props.type !== "gateway") {
            return isSendButtonDisabled;
        }
        return isSendButtonDisabled || !this.thread?.gateway_notifications?.length;
    },
    onFocusin() {
        super.onFocusin(...arguments);
        if (this.props.type !== "gateway" && this.thread) {
            this.thread.gateway_notifications = [];
        }
    },
    async onClickFullComposer() {
        if (this.props.type !== "gateway") {
            return super.onClickFullComposer(...arguments);
        }
        const attachmentIds = this.props.composer.attachments.map(
            (attachment) => attachment.id
        );
        // V19: the composer body is the html field (mentions are resolved by
        // the composer model); suggested recipients carry partner_id directly.
        const context = {
            default_attachment_ids: attachmentIds,
            default_body: this.formatDefaultBodyForFullComposer(
                this.props.composer.composerHtml
            ),
            default_model: this.thread.model,
            default_partner_ids: this.thread.suggestedRecipients
                .filter((recipient) => recipient.partner_id)
                .map((recipient) => recipient.partner_id),
            default_res_ids: [this.thread.id],
            default_subtype_xmlid: "mail.mt_comment",
            default_wizard_partner_ids: Array.from(
                new Set(
                    this.thread.gateway_followers.map((follower) => {
                        return follower.id;
                    })
                )
            ),
            default_wizard_channel_ids: Array.from(
                new Set(
                    this.thread.gateway_followers
                        .map((follower) => {
                            return follower.gateway_channels.map(
                                (channel) => channel?.id
                            );
                        })
                        .flat()
                )
            ),
        };
        const action = {
            name: _t("Gateway message"),
            type: "ir.actions.act_window",
            res_model: "mail.compose.gateway.message",
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
            context: context,
        };
        const options = {
            onClose: (args) => {
                // V19: args === {dismiss: true} (X/escape) or {special: true}
                // (discard); otherwise the message was posted.
                const isDiscard = args?.dismiss || args?.special;
                if (!isDiscard) {
                    this.clear();
                    this.props.composer.replyToMessage = undefined;
                    this.thread?.fetchNewMessages();
                }
            },
        };
        await this.env.services.action.doAction(action, options);
    },
});
