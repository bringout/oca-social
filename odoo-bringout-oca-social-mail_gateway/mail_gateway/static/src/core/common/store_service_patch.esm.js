import {Store} from "@mail/core/common/store_service";
import {patch} from "@web/core/utils/patch";

// NOTE: thread.gateway_followers needs no fetch patch in v19 — the server
// sends it as a Store relation inside the "mail.thread" payload, so the
// declared fields.Many("res.partner") is populated by the store insert.

patch(Store.prototype, {
    async getMessagePostParams(params) {
        const post_params = await super.getMessagePostParams(...arguments);
        if (params.thread.gateway_notifications) {
            post_params.post_data.gateway_notifications =
                params.thread.gateway_notifications;
        }
        return post_params;
    },
});
